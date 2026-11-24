"""Train the move scorer Q(state, action) on export.ts output.

    python tools/train/train.py --data ~/danlm-train --out ~/danlm-model [--epochs 10] [--device mps]

Loss per decision: mean squared error to DanLM's value for each candidate,
plus cross-entropy over the candidates (logits Q / tau) towards the play DanLM
made. Validation reports how often the best-scored candidate is DanLM's play.

Writes <out>/model.pt (best validation agreement) and the browser/Node weights
<out>/model.json + <out>/model.bin (float32), read by tools/train/model.ts.
"""
import argparse
import json
import math
import os
import time

import numpy as np
import torch
from torch import nn


class Split:
    def __init__(self, path):
        meta = json.load(open(os.path.join(path, 'meta.json')))
        self.meta = meta
        n, m, sd, ad = meta['decisions'], meta['actions'], meta['stateDim'], meta['actionDim']
        if n == 0:
            raise SystemExit('%s has no decisions; export more games (about 5%% of games go to val)' % path)
        self.states = np.memmap(os.path.join(path, 'states.u8'), np.uint8, 'r', shape=(n, sd))
        self.actions = np.memmap(os.path.join(path, 'actions.u8'), np.uint8, 'r', shape=(m, ad))
        self.q = np.memmap(os.path.join(path, 'q.f32'), np.float32, 'r', shape=(m,))
        self.offsets = np.fromfile(os.path.join(path, 'offsets.i32'), np.int32)
        self.chosen = np.fromfile(os.path.join(path, 'chosen.i32'), np.int32)
        assert len(self.offsets) == n + 1 and len(self.chosen) == n, 'incomplete export'
        self.n = n

    def batch(self, index, device):
        """Decisions `index` padded to the largest candidate group in the batch."""
        index = np.sort(index)
        start, end = self.offsets[index], self.offsets[index + 1]
        sizes = end - start
        k = int(sizes.max())
        rows = start[:, None] + np.arange(k)[None, :]
        mask = np.arange(k)[None, :] < sizes[:, None]
        rows = np.where(mask, rows, start[:, None])
        flat = rows.reshape(-1)
        to = lambda a, dtype: torch.from_numpy(np.ascontiguousarray(a)).to(device=device, dtype=dtype)
        return (to(self.states[index], torch.float32), to(self.actions[flat], torch.float32).view(len(index), k, -1),
                to(self.q[flat], torch.float32).view(len(index), k), to(mask, torch.bool),
                to(self.chosen[index], torch.long))


class Scorer(nn.Module):
    """MLP over [state, action]; the first layer is split so the state part is computed once per decision."""

    def __init__(self, state_dim, action_dim, hidden, state_scale, action_scale):
        super().__init__()
        self.register_buffer('state_scale', torch.tensor(state_scale, dtype=torch.float32))
        self.register_buffer('action_scale', torch.tensor(action_scale, dtype=torch.float32))
        self.state_in = nn.Linear(state_dim, hidden[0])
        self.action_in = nn.Linear(action_dim, hidden[0], bias=False)
        layers = []
        for a, b in zip(hidden, hidden[1:]):
            layers += [nn.ReLU(), nn.Linear(a, b)]
        self.body = nn.Sequential(*layers, nn.ReLU(), nn.Linear(hidden[-1], 1))

    def forward(self, states, actions):
        # states [B, S], actions [B, K, A] -> q [B, K]
        s = self.state_in(states * self.state_scale)
        a = self.action_in(actions * self.action_scale)
        return self.body(s[:, None, :] + a).squeeze(-1)


def losses(model, batch, tau):
    states, actions, q, mask, chosen = batch
    pred = model(states, actions)
    mse = ((pred - q) ** 2 * mask).sum() / mask.sum()
    logits = (pred / tau).masked_fill(~mask, -1e9)
    ce = nn.functional.cross_entropy(logits, chosen)
    agree = (logits.argmax(1) == chosen).float().mean()
    return mse, ce, agree


def export_weights(model, meta, hidden, path):
    """model.json describes the layers; model.bin holds float32 weights in that order."""
    tensors, layers = [], []
    def add(name, t):
        t = t.detach().cpu().float().contiguous()
        layers.append({'name': name, 'shape': list(t.shape), 'offset': sum(x.numel() for x in tensors)})
        tensors.append(t)
    add('state_in.weight', model.state_in.weight)
    add('state_in.bias', model.state_in.bias)
    add('action_in.weight', model.action_in.weight)
    linears = [m for m in model.body if isinstance(m, nn.Linear)]
    for i, lin in enumerate(linears):
        add('body.%d.weight' % i, lin.weight)
        add('body.%d.bias' % i, lin.bias)
    np.concatenate([t.numpy().reshape(-1) for t in tensors]).astype('<f4').tofile(path + '.bin')
    json.dump({'featureVersion': meta['version'], 'stateDim': meta['stateDim'], 'actionDim': meta['actionDim'],
               'stateScale': meta['stateScale'], 'actionScale': meta['actionScale'], 'hidden': hidden,
               'tensors': layers}, open(path + '.json', 'w'), indent=1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--data', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--epochs', type=int, default=10)
    p.add_argument('--batch', type=int, default=512, help='decisions per step')
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--hidden', default='512,512,256')
    p.add_argument('--tau', type=float, default=0.1, help='temperature for the choice loss, in value units')
    p.add_argument('--ce-weight', type=float, default=0.1)
    p.add_argument('--device', default='auto')
    p.add_argument('--limit', type=int, default=0, help='use only the first N training decisions (quick runs)')
    p.add_argument('--seed', type=int, default=0)
    a = p.parse_args()

    device = a.device
    if device == 'auto':
        device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    torch.manual_seed(a.seed)
    rng = np.random.default_rng(a.seed)
    train, val = Split(os.path.join(a.data, 'train')), Split(os.path.join(a.data, 'val'))
    meta = train.meta
    assert val.meta['version'] == meta['version'] and val.meta['stateDim'] == meta['stateDim']
    hidden = [int(x) for x in a.hidden.split(',')]
    model = Scorer(meta['stateDim'], meta['actionDim'], hidden, meta['stateScale'], meta['actionScale']).to(device)
    params = sum(p.numel() for p in model.parameters())
    n_train = min(train.n, a.limit) if a.limit else train.n
    steps = a.epochs * math.ceil(n_train / a.batch)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=steps, pct_start=0.05)
    os.makedirs(a.out, exist_ok=True)
    print('device %s, %d parameters, %d train / %d val decisions, %d steps' % (device, params, n_train, val.n, steps), flush=True)

    def evaluate():
        model.eval()
        totals = np.zeros(3)
        count = 0
        with torch.no_grad():
            for i in range(0, val.n, 2048):
                index = np.arange(i, min(val.n, i + 2048))
                mse, ce, agree = losses(model, val.batch(index, device), a.tau)
                totals += np.array([mse.item(), ce.item(), agree.item()]) * len(index)
                count += len(index)
        model.train()
        return totals / max(count, 1)

    best = -1.0
    started = time.time()
    for epoch in range(a.epochs):
        order = rng.permutation(n_train)
        run = np.zeros(3)
        for step, i in enumerate(range(0, n_train, a.batch)):
            mse, ce, agree = losses(model, train.batch(order[i:i + a.batch], device), a.tau)
            loss = mse + a.ce_weight * ce
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            run += [mse.item(), ce.item(), agree.item()]
            if (step + 1) % 200 == 0:
                print('  epoch %d step %d: mse %.4f ce %.3f agree %.3f' % ((epoch, step + 1) + tuple(run / 200)), flush=True)
                run[:] = 0
        vm, vc, va = evaluate()
        print('epoch %d (%.0f min): val mse %.4f ce %.3f agree %.3f' % (epoch, (time.time() - started) / 60, vm, vc, va), flush=True)
        if va > best:
            best = va
            torch.save({'state_dict': model.state_dict(), 'hidden': hidden, 'meta': meta, 'args': vars(a)},
                       os.path.join(a.out, 'model.pt'))
            export_weights(model, meta, hidden, os.path.join(a.out, 'model'))
    print('best val agreement %.3f; weights in %s/model.json + model.bin' % (best, a.out))


if __name__ == '__main__':
    main()
