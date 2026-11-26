"""Host one seat of a NJUPT-competition GuanDan bot for the arena.

Reads one JSON protocol message per line on stdin and answers each with one
JSON line: {"index": n} for an act message, {"ok": true} for a notify. The
bots print freely, so their stdout is sent to stderr and only this host writes
to the real stdout.

usage: python3 -I bot_host.py <baselines-dir> <bot-name> <seat>
"""
import io
import json
import os
import sys
import traceback

BOTS = {
    # name: (subdirectory, glue)
    'njupt-guandan-ai': ('fin-njupt-guandan-ai', 'njupt'),
    'egg-expert': ('fin-egg-expert/吃蛋能手', 'ordered'),
    'guanglan-iot': ('fin-guanglan-iot/光蓝物联', 'ordered'),
    'egg-pancake': ('2nd-egg-pancake', 'pancake'),
}


def main():
    root, name, seat = sys.argv[1], sys.argv[2], int(sys.argv[3])
    sub, glue = BOTS[name]
    sys.path.insert(0, os.path.join(root, sub))
    out = sys.stdout
    sys.stdout = sys.stderr if os.environ.get('ARENA_BOT_LOG') else open(os.devnull, 'w')

    from state import State  # noqa: E402  (bot-local module)
    from action import Action  # noqa: E402

    log = io.StringIO()
    if glue == 'ordered':
        state, action = State(log), Action(log)
    else:
        state, action = State(), (Action(seat) if glue == 'njupt' else Action())

    def choose(msg):
        if glue == 'njupt':
            rest = [p['rest'] for p in msg['publicInfo']]
            return action.parse(msg, seat, rest)
        if glue == 'ordered':
            return action.parse(msg, state)
        return action.parse_AI(msg, seat)

    for line in sys.stdin:
        msg = json.loads(line)
        reply = {'ok': True}
        try:
            state.parse(msg)
        except Exception:
            reply['stateError'] = traceback.format_exc(limit=2)
        if 'actionList' in msg:
            try:
                index = choose(msg)
                reply['index'] = index if isinstance(index, int) and 0 <= index <= msg['indexRange'] else None
            except Exception:
                reply['index'] = None
                reply['error'] = traceback.format_exc(limit=3)
        if log.tell() > 1 << 20:
            log.seek(0)
            log.truncate()
        out.write(json.dumps(reply) + '\n')
        out.flush()


if __name__ == '__main__':
    main()
