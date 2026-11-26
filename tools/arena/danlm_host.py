"""Serve DanLM (github.com/dashidhy/DanLM) as the opponent seats of the arena.

DanLM ships only macOS ARM64 builds of its engine and model code, so this runs
on an Apple Silicon Mac with Python 3.12 and `pip install torch numpy onnxruntime`.

The arena's referee is this game's engine. The host keeps a shadow GuanDanRound
on DanLM's engine, replays every move into it, and asks the model when one of
its seats is to play. A move or turn the two engines disagree on is reported as
an error instead of being forced through.

usage: PYTHONPATH=<DanLM> python3 danlm_host.py <DanLM> [agent]   (agent: danlm_v1 | danzero_v1t | danzero_v0)
       python3 danlm_host.py --mock    (no DanLM: lead the first card, otherwise pass; tests the plumbing.
                                     An act message may say "lead": true/false for the mock; DanLM ignores it.)
       PYTHONPATH=<DanLM> python3 danlm_host.py <DanLM> --selftest   (one round of DanLM vs itself)

Protocol, one JSON object per line each way:
  {"op":"start","hands":[[codes]x4],"level":"T","first":seat[,"levels":["T","5"]]} -> {"ok":true,"player":p}
  {"op":"act","seat":s[,"top":64]}           -> {"cards":[codes],"rank":"9","type":"plate","flush":bool} ([] = pass)
      with "top": also "legal" (count), "q": [[type, rank, "S5H5", value], ...] best first, and "argmaxAgrees"
  {"op":"step","seat":s,"cards":[codes],"rank":"9","type":"plate"} -> {"ok":true,"player":p,"done":bool,"guessed":bool}
"rank" is the declared rank, DanLM's way: a run is named by its highest rank, a full house by
its triple. "type" is DanLM's play type (single, double, triple, fullhouse, straight, tube,
plate, normalbomb, flushbomb, jokerbomb). With wild cards the same cards can declare several
ways, and the rank alone does not tell them apart: two wilds make S4 C4 D4 H5 H5 (level 5) a
full house or a 5-card bomb of 4s, C4 H4 C5 S5 H5 H5 two triples or three pairs up to 5.
"flush" (true for a straight flush) stands in for the type in step messages from older clients.
"guessed" means DanLM's engine has no play of these cards with that type and rank.
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

    def start(self, hands, level, first, levels=None):
        self.hands = [list(h) for h in hands]
        self.leading, self.turn = True, first
        return first

    def act(self, seat, lead=None):
        leading = self.leading if lead is None else lead
        return {'cards': [self.hands[seat][0]] if leading else [], 'rank': None}

    def is_flush(self, play):
        return 'flush' in str(self.play_type_of(play)).lower()

    def step(self, seat, cards, rank, flush=None):
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
        from danzero.engine.actions import DIM_CARDS, DIM_PLAY_TYPE, play_type_of
        from danzero.engine.game import GuanDanRound
        from ui_agent import UIAgent
        self.np, self.C, self.Round = np, C, GuanDanRound
        self.dim_cards, self.dim_type = DIM_CARDS, DIM_PLAY_TYPE
        self.play_type_of = play_type_of
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

    def start(self, hands, level, first, levels=None):
        lv = RANKS.index(level) + 2
        teams = tuple(RANKS.index(l) + 2 for l in levels) if levels else (lv, lv)
        self.agent.reset_round(lv)
        self.round = self.Round(level=lv, hands=[self.vector(h) for h in hands], first_player=first, team_levels=teams)
        self.obs = self.round.get_observation()
        return int(self.obs.player)

    def play_cards(self, play):
        counts = play[:self.dim_cards]
        return [self.code(i) for i in range(len(counts)) for _ in range(int(counts[i]))]

    def act(self, seat, top=0):
        if self.obs is None or int(self.obs.player) != seat:
            raise RuntimeError('turn mismatch: DanLM engine expects seat %s, referee asked seat %s'
                               % (None if self.obs is None else int(self.obs.player), seat))
        index = self.agent.select_play(self.obs, self.round)
        play = self.obs.legal_plays[index]
        reply = {'cards': self.play_cards(play), 'rank': self.rank_of(play), 'type': self.type_of(play),
                 'flush': self.is_flush(play)}
        if top:
            # Training targets: the model's values for its best candidates, chosen play included.
            q = self.agent.get_q_values(self.obs, self.round)
            order = [int(i) for i in self.np.argsort(-q)[:top]]
            if index not in order:
                order.append(int(index))
            reply['legal'] = int(len(q))
            reply['q'] = [[self.play_type_of(self.obs.legal_plays[i]), self.rank_of(self.obs.legal_plays[i]),
                           ''.join(self.play_cards(self.obs.legal_plays[i])), round(float(q[i]), 4)] for i in order]
            reply['argmaxAgrees'] = int(order[0]) == int(index)
        return reply

    def type_of(self, play):
        return str(self.play_type_of(play))

    def is_flush(self, play):
        return 'flush' in self.type_of(play).lower()

    def step(self, seat, cards, rank, flush=None, ptype=None):
        if int(self.obs.player) != seat:
            raise RuntimeError('turn mismatch: DanLM engine expects seat %s, referee played seat %s' % (int(self.obs.player), seat))
        want = sorted(cards)
        plays = self.obs.legal_plays
        matches = [i for i, play in enumerate(plays) if sorted(self.play_cards(play)) == want]
        if not matches:
            raise RuntimeError('move %s is not legal in the DanLM engine' % (cards or 'PASS'))
        guessed = False
        if cards:
            # Same cards, several declarations (wild cards): the referee's type decides, then its
            # rank (four kings carry none). Without a type, the flush flag separates a straight
            # flush from a plain straight with the same highest rank.
            typed = [i for i in matches if (self.type_of(plays[i]) == ptype if ptype
                                            else flush is None or self.is_flush(plays[i]) == flush)]
            ranked = [i for i in typed if self.type_of(plays[i]) == 'jokerbomb' or (rank and self.rank_of(plays[i]) == rank)]
            guessed = not ranked
            matches = ranked or typed or matches
        play = plays[matches[0]]
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
    moves = agree = 0
    while True:
        chosen = bot.act(player, 8)
        assert chosen['q'] and chosen['legal'] >= len(chosen['q']) - 1, chosen
        agree += chosen['argmaxAgrees']
        result = bot.step(player, chosen['cards'], chosen['rank'], ptype=chosen['type'])
        assert not result['guessed'], 'declaration of %s had to be guessed' % chosen
        moves += 1
        if result['done']:
            break
        player = result['player']
    print('selftest ok: %d moves, finish order %s, chosen play = best Q in %d of %d'
          % (moves, bot.round.finish_order, agree, moves))


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
                reply = {'ok': True, 'player': bot.start(msg['hands'], msg['level'], msg['first'], msg.get('levels'))}
            elif msg['op'] == 'act':
                reply = bot.act(msg['seat'], msg.get('top', 0)) if isinstance(bot, DanLM) else bot.act(msg['seat'], msg.get('lead'))
            else:
                reply = dict(ok=True, **(bot.step(msg['seat'], msg['cards'], msg.get('rank'), msg.get('flush'), msg.get('type'))
                                         if isinstance(bot, DanLM) else bot.step(msg['seat'], msg['cards'], msg.get('rank'))))
        except Exception as e:
            reply = {'error': str(e), 'trace': traceback.format_exc(limit=3)}
        out.write(json.dumps(reply) + '\n')
        out.flush()


if __name__ == '__main__':
    main()
