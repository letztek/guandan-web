"""Teach a trained move scorer to judge positions: a value head V(position).

    python tools/train/train_value.py --model ~/danlm-model-v4/model.pt \\
        --data ~/danlm-train-value-v2,~/danlm-train-value-a2 --out ~/danlm-model-v4v

The move scorer answers "how good is each play here"; that is a comparison
within one position. V answers "from where this seat sits, how many levels
will its team win or lose this hand?", trained on how each hand actually ended
(outcome.f32 from export.ts), the same way for all four seats, so it is one
scale: +1 for one side is -1 for the other.

The move scorer is frozen: V reads its first state layer, relu(state_in(state)),
through a small head, so the move choices stay exactly as they were. Writes
<out>/model.json + model.bin: the scorer's tensors unchanged plus value.N.*.
Validation prints how well V predicts outcomes against always guessing the mean.
"""
import argparse
import math
import os
import time

import numpy as np
import torch
from torch import nn

from train import Scorer, Splits, export_weights


class ValueHead(nn.Module):
    def __init__(self, width, hidden):
        super().__init__()
        self.hidden = hidden
        sizes = [width] + hidden
        layers = []
        for a, b in zip(sizes, sizes[1:]):
            layers += [nn.Linear(a, b), nn.ReLU()]
        self.body = nn.Sequential(*layers, nn.Linear(sizes[-1], 1))

    def forward(self, trunk):
        return self.body(trunk).squeeze(-1)


def trunk_of(scorer, states):
    with torch.no_grad():
        return torch.relu(scorer.state_in(states * scorer.state_scale))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', required=True, help='the move scorer checkpoint (model.pt from train.py)')
    p.add_argument('--data', required=True, help='export directories with outcome.f32, separated by commas')
    p.add_argument('--val', default='')
    p.add_argument('--out', required=True)
    p.add_argument('--epochs', type=int, default=6)
    p.add_argument('--batch', type=int, default=4096)
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--hidden', default='256')
    p.add_argument('--device', default='auto')
    a = p.parse_args()
    paths = lambda text: [os.path.expanduser(d) for d in text.split(',') if d]
    data = paths(a.data)
    a.out, a.model = os.path.expanduser(a.out), os.path.expanduser(a.model)
    device = a.device
    if device == 'auto':
        device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'

    ckpt = torch.load(a.model, weights_only=False, map_location='cpu')
    meta, hidden = ckpt['meta'], ckpt['hidden']
    scorer = Scorer(meta['stateDim'], meta['actionDim'], hidden, meta['stateScale'], meta['actionScale'])
    scorer.load_state_dict(ckpt['state_dict'])
    scorer.eval().to(device)
    for param in scorer.parameters():
        param.requires_grad_(False)

    train = Splits([os.path.join(d, 'train') for d in data])
    val = Splits([os.path.join(d, 'val') for d in (paths(a.val) or data)])
    for split in (train, val):
        assert split.meta['version'] == meta['version'] and split.meta['stateDim'] == meta['stateDim'], \
            'data exported with different features than the model'
        assert all(part.outcome is not None for part in split.parts), 'export has no outcome.f32; re-export'
    def gather(split, index):
        index = np.sort(index)
        part = np.searchsorted(split.starts, index, side='right') - 1
        states, outcomes = [], []
        for i in np.unique(part):
            local = index[part == i] - split.starts[i]
            states.append(np.asarray(split.parts[i].states[local]))
            outcomes.append(split.parts[i].outcome[local])
        return (torch.from_numpy(np.concatenate(states)).to(device, torch.float32),
                torch.from_numpy(np.concatenate(outcomes)).to(device, torch.float32))

    head = ValueHead(hidden[0], [int(x) for x in a.hidden.split(',')]).to(device)
    steps = a.epochs * math.ceil(train.n / a.batch)
    opt = torch.optim.AdamW(head.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=steps, pct_start=0.05)
    train_mean = float(np.mean(np.concatenate([p.outcome for p in train.parts])))
    print('device %s, %d train / %d val positions, outcome mean %.3f' % (device, train.n, val.n, train_mean), flush=True)
    rng = np.random.default_rng(0)

    def evaluate():
        head.eval()
        preds, targets = [], []
        with torch.no_grad():
            for i in range(0, val.n, 16384):
                states, outcome = gather(val, np.arange(i, min(val.n, i + 16384)))
                preds.append(head(trunk_of(scorer, states)).cpu().numpy())
                targets.append(outcome.cpu().numpy())
        head.train()
        pred, target = np.concatenate(preds), np.concatenate(targets)
        mse = float(np.mean((pred - target) ** 2))
        base = float(np.mean((train_mean - target) ** 2))
        sign = float(np.mean(np.sign(pred) == np.sign(target)))
        corr = float(np.corrcoef(pred, target)[0, 1])
        return mse, base, sign, corr

    best, started = math.inf, time.time()
    for epoch in range(a.epochs):
        order = rng.permutation(train.n)
        for i in range(0, train.n, a.batch):
            states, outcome = gather(train, order[i:i + a.batch])
            loss = ((head(trunk_of(scorer, states)) - outcome) ** 2).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
        mse, base, sign, corr = evaluate()
        print('epoch %d (%.0f min): val mse %.4f (guessing the mean: %.4f, R2 %.3f), right side %.1f%%, correlation %.3f' % (
            epoch, (time.time() - started) / 60, mse, base, 1 - mse / base, 100 * sign, corr), flush=True)
        if mse < best:
            best = mse
            os.makedirs(a.out, exist_ok=True)
            export_weights(scorer.cpu(), meta, hidden, os.path.join(a.out, 'model'), value=head.cpu())
            torch.save({'value_state_dict': head.state_dict(), 'value_hidden': head.hidden, 'scorer': a.model},
                       os.path.join(a.out, 'value.pt'))
            scorer.to(device)
            head.to(device)
    print('best val mse %.4f; weights in %s/model.json + model.bin' % (best, a.out))


if __name__ == '__main__':
    main()
