"""Serve DanLM (github.com/dashidhy/DanLM) as the opponent seats of the arena.

DanLM ships only macOS ARM64 builds of its engine and model code, so this runs
on an Apple Silicon Mac with Python 3.12 and `pip install torch numpy onnxruntime`.

The arena's referee is this game's engine. The host keeps a shadow GuanDanRound
on DanLM's engine, replays every move into it, and asks the model when one of
its seats is to play. A move or turn the two engines disagree on is reported as
an error instead of being forced through.

usage: PYTHONPATH=<DanLM> python3 danlm_host.py <DanLM> [agent]   (agent: danlm_v1 | danzero_v1t | danzero_v0)
       python3 danlm_host.py --mock    (no DanLM: lead the first card, otherwise pass; tests the plumbing)
       PYTHONPATH=<DanLM> python3 danlm_host.py <DanLM> --selftest   (one round of DanLM vs itself)

Protocol, one JSON object per line each way:
  {"op":"start","hands":[[codes]x4],"level":"T","first":seat}   -> {"ok":true,"player":p}
  {"op":"act","seat":s}                                          -> {"cards":[codes],"rank":"9"} ([] = pass)
  {"op":"step","seat":s,"cards":[codes],"rank":"9"}              -> {"ok":true,"player":p,"done":bool,"guessed":bool}
"rank" is the declared rank; with wild cards the same cards can declare several ways.
"guessed" means DanLM's engine had to pick among such declarations without a matching rank.
Card codes are the competition spelling: suit + rank (T for ten), SB / HR for the jokers.
"""
import json
import os
import sys
import traceback

RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']


class Mock:
    def __init__(self):
        self.hands = None
        self.leading = True
        self.turn = 0

    def start(self, hands, level, first):
        self.hands = [list(h) for h in hands]
        self.leading, self.turn = True, first
        return first

    def act(self, seat):
        return {'cards': [self.hands[seat][0]] if self.leading else [], 'rank': None}

    def step(self, seat, cards, rank):
        for c in cards:
            self.hands[seat].remove(c)
        self.leading = False
        return {'player': -1, 'done': False}


class DanLM:
    def __init__(self, root, agent_key):
        sys.path.insert(0, os.path.join(root, 'ui'))
        sys.path.insert(0, root)
        import numpy as np
        from danzero.engine import cards as C
        from danzero.engine.actions import DIM_CARDS, DIM_PLAY_TYPE
        from danzero.engine.game import GuanDanRound
        from ui_agent import UIAgent
        self.np, self.C, self.Round = np, C, GuanDanRound
        self.dim_cards, self.dim_type = DIM_CARDS, DIM_PLAY_TYPE
        self.agent = UIAgent(agent_key)
        self.template = C.deal_hands(seed=0)[0]
        self.round = self.obs = None

    def card_int(self, code):
        if code == 'SB':
            return self.C.SMALL_JOKER
        if code == 'HR':
            return self.C.BIG_JOKER
        return self.C.SUIT_CHARS.index(code[0]) * self.C.NUM_RANKS + RANKS.index(code[1])

    def code(self, card_int):
        if card_int == self.C.SMALL_JOKER:
            return 'SB'
        if card_int == self.C.BIG_JOKER:
            return 'HR'
        return self.C.SUIT_CHARS[card_int // self.C.NUM_RANKS] + RANKS[card_int % self.C.NUM_RANKS]

    def vector(self, codes):
        v = self.np.zeros_like(self.template)
        for c in codes:
            v[self.card_int(c)] += 1
        return v

    def start(self, hands, level, first):
        lv = RANKS.index(level) + 2
        self.agent.reset_round(lv)
        self.round = self.Round(level=lv, hands=[self.vector(h) for h in hands], first_player=first, team_levels=(lv, lv))
        self.obs = self.round.get_observation()
        return int(self.obs.player)

    def play_cards(self, play):
        counts = play[:self.dim_cards]
        return [self.code(i) for i in range(len(counts)) for _ in range(int(counts[i]))]

    def act(self, seat):
        if self.obs is None or int(self.obs.player) != seat:
            raise RuntimeError('turn mismatch: DanLM engine expects seat %s, referee asked seat %s'
                               % (None if self.obs is None else int(self.obs.player), seat))
        index = self.agent.select_play(self.obs, self.round)
        play = self.obs.legal_plays[index]
        return {'cards': self.play_cards(play), 'rank': self.rank_of(play)}

    def step(self, seat, cards, rank):
        if int(self.obs.player) != seat:
            raise RuntimeError('turn mismatch: DanLM engine expects seat %s, referee played seat %s' % (int(self.obs.player), seat))
        want = sorted(cards)
        matches = [i for i, play in enumerate(self.obs.legal_plays) if sorted(self.play_cards(play)) == want]
        if not matches:
            raise RuntimeError('move %s is not legal in the DanLM engine' % (cards or 'PASS'))
        guessed = False
        if len(matches) > 1:
            # Same cards, several declarations (wild cards): prefer the claimed rank.
            ranked = [i for i in matches if rank and self.rank_of(self.obs.legal_plays[i]) == rank]
            guessed = not ranked
            matches = ranked or matches
        play = self.obs.legal_plays[matches[0]]
        new_obs = self.round.step(matches[0])
        new_trick = new_obs is not None and new_obs.is_leading and new_obs.player == self.round.state.lead_player
        self.agent.observe_action(seat, play, new_trick)
        self.obs = new_obs
        done = new_obs is None or self.round.done
        return {'player': -1 if done else int(new_obs.player), 'done': bool(done), 'guessed': guessed}

    def rank_of(self, play):
        index = int(play[self.dim_cards + self.dim_type:].argmax())
        return (RANKS + ['B', 'R'])[index] if index < 15 else None


def selftest(root):
    bot = DanLM(root, sys.argv[3] if len(sys.argv) > 3 else 'danlm_v1')
    hands = bot.C.deal_hands(seed=7)
    codes = [[bot.code(i) for i in range(len(h)) for _ in range(int(h[i]))] for h in hands]
    player = bot.start(codes, '5', 0)
    moves = 0
    while True:
        chosen = bot.act(player)
        result = bot.step(player, chosen['cards'], chosen['rank'])
        moves += 1
        if result['done']:
            break
        player = result['player']
    print('selftest ok: %d moves, finish order %s' % (moves, bot.round.finish_order))


def main():
    if sys.argv[1:2] == ['--mock']:
        bot = Mock()
    elif '--selftest' in sys.argv:
        return selftest(sys.argv[1])
    else:
        bot = DanLM(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'danlm_v1')
    out = sys.stdout
    sys.stdout = sys.stderr
    for line in sys.stdin:
        msg = json.loads(line)
        try:
            if msg['op'] == 'start':
                reply = {'ok': True, 'player': bot.start(msg['hands'], msg['level'], msg['first'])}
            elif msg['op'] == 'act':
                reply = bot.act(msg['seat'])
            else:
                reply = dict(ok=True, **bot.step(msg['seat'], msg['cards'], msg.get('rank')))
        except Exception as e:
            reply = {'error': str(e), 'trace': traceback.format_exc(limit=3)}
        out.write(json.dumps(reply) + '\n')
        out.flush()


if __name__ == '__main__':
    main()
