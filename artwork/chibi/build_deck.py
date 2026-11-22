"""Print the 54 FEZ cards and review sheets from the suit variants of each rank."""

import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ART = Path(__file__).resolve().parent
REPO = ART.parents[1]
WIDTH, HEIGHT = 294, 406
SUITS = ('S', 'H', 'C', 'D')
RANKS = ('A', *map(str, range(2, 11)), 'J', 'Q', 'K')
SYMBOLS = {'S': '♠', 'H': '♥', 'C': '♣', 'D': '♦', 'J': '✦'}
INK = {'S': '#1f3037', 'C': '#173c31', 'H': '#a62d42', 'D': '#ae412e', 'J': '#423c5d'}
WASH = {'S': '#e7e6ee', 'C': '#e0ebdb', 'H': '#f5e2e1', 'D': '#f5e5c9', 'J': '#e9e3ed'}
ACCENT = {'S': '#8a8da4', 'C': '#7d997f', 'H': '#bd8790', 'D': '#bd9767', 'J': '#a194ae'}
JOKER_NAMES = {'SJ': '小王', 'BJ': '大王'}
# Each row is one scan line of the countable pattern, centered in the left field.
# Row spacing is in print pixels. Blank rows preserve the familiar bridge layouts.
PIPS = {
    '2': (31, ('x..', '..x')),
    '3': (27, ('x..', '.x.', '..x')),
    '4': (40, ('x.x', 'x.x')),
    '5': (27, ('x.x', '.x.', 'x.x')),
    '6': (32, ('x.x', 'x.x', 'x.x')),
    '7': (18, ('x.x', '.x.', 'x.x', '...', 'x.x')),
    '8': (32, ('x.x', 'x.x', 'x.x', 'x.x')),
    '9': (30, ('xxx', 'xxx', 'xxx')),
    '10': (30, ('x.x', 'x.x', 'x.x', 'x.x', 'x.x')),
}
PROOF_CARDS = [('H','7'),('C','5'),('S','10'),('D','A'),('S','J'),('H','Q'),('C','K'),('J','BJ'),('J','SJ')]
TYPEFACES = {
    'rank': ('georgiab.ttf', 'Georgia Bold.ttf', 'DejaVuSerif-Bold.ttf'),
    'numeral': ('segoeuib.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'),
    'serif': ('georgia.ttf', 'Georgia.ttf', 'DejaVuSerif.ttf'),
    'sign': ('seguisym.ttf', 'Apple Symbols.ttf', 'DejaVuSans.ttf'),
    'chinese': ('mingliu.ttc', 'Songti.ttc', 'NotoSerifCJK-Regular.ttc', 'NotoSerifTC-Regular.otf'),
    'chinese-bold': ('msjhbd.ttc', 'PingFang.ttc', 'NotoSansCJK-Bold.ttc', 'NotoSansTC-Bold.otf'),
}


def load_typefaces(font_dir):
    @lru_cache(maxsize=None)
    def get(style, size):
        for filename in TYPEFACES[style]:
            file = font_dir / filename if font_dir else filename
            try:
                return ImageFont.truetype(str(file), size)
            except OSError:
                continue
        raise FileNotFoundError(f'Install a {style} font or supply --font-dir. Expected {TYPEFACES[style]}.')
    return get


def nearest_gutter(mask, axis):
    """Find the emptiest central separator, favoring the middle on a tie."""
    counts = np.count_nonzero(mask, axis=1-axis)
    # Keep antialiased outlines clear of the split even if a single row is transparent.
    counts = np.convolve(counts, np.ones(7, dtype=int), mode='same')
    center = len(counts)//2
    radius = len(counts)//7
    candidates = range(center-radius, center+radius+1)
    chosen = min(candidates, key=lambda i: (counts[i], abs(i-center)))
    return chosen, int(counts[chosen])


def quadrant_boxes(alpha):
    """Rows and columns can have different centers if a lance is particularly long."""
    mask = np.asarray(alpha) > 35
    h, w = mask.shape
    x, vertical_cost = nearest_gutter(mask, 1)
    left_y, left_cost = nearest_gutter(mask[:, :x], 0)
    right_y, right_cost = nearest_gutter(mask[:, x:], 0)
    by_column = [(0,0,x,left_y), (x,0,w,right_y), (0,left_y,x,h), (x,right_y,w,h)]

    y, horizontal_cost = nearest_gutter(mask, 0)
    top_x, top_cost = nearest_gutter(mask[:y, :], 1)
    bottom_x, bottom_cost = nearest_gutter(mask[y:, :], 1)
    by_row = [(0,0,top_x,y), (top_x,0,w,y), (0,y,bottom_x,h), (bottom_x,y,w,h)]
    return min([(vertical_cost+left_cost+right_cost, by_column),
                (horizontal_cost+top_cost+bottom_cost, by_row)], key=lambda pair: pair[0])[1]


def load_cells(source, keys, boxes=None):
    with Image.open(source) as original:
        sheet = original.convert('RGBA')
    alpha = sheet.getchannel('A')
    if alpha.getextrema()[0] > 0:
        raise ValueError(f'{source.name} needs a transparent background.')
    if boxes is None and len(keys) == 4:
        boxes = quadrant_boxes(alpha)
    if boxes is None:
        x, _ = nearest_gutter(np.asarray(alpha)>35, 1)
        boxes = [(0,0,x,sheet.height), (x,0,sheet.width,sheet.height)]
    if len(boxes) != len(keys):
        raise ValueError(f'{source.name}: expected {len(keys)} crop boxes.')
    images = {}
    for key, box in zip(keys, boxes):
        cell = sheet.crop(tuple(box))
        bounds = cell.getchannel('A').point(lambda a: 255 if a > 75 else 0).getbbox()
        if bounds is None:
            raise ValueError(f'{source.name} has an empty cell for {key}.')
        images[key] = cell.crop(bounds)
    return images


def load_illustrations(folder):
    with (folder/'ranks.json').open(encoding='utf-8-sig') as file:
        ranks = json.load(file)
    if set(ranks) != set(RANKS):
        raise ValueError('ranks.json must include every rank from A to K exactly once.')
    names = {rank: data['name'] for rank, data in ranks.items()}
    names.update(JOKER_NAMES)
    images = {}
    for rank, data in ranks.items():
        keys = [(suit, rank) for suit in SUITS]
        images.update(load_cells(folder/data['sheet'], keys, data.get('boxes')))
    images.update(load_cells(folder/'jokers.png', [('J','BJ'),('J','SJ')]))
    return images, names


def make_paper():
    # Identical seeded print grain on each face makes image diffs repeatable.
    x = np.linspace(-1, 1, WIDTH)[None, :]
    y = np.linspace(-1, 1, HEIGHT)[:, None]
    shading = (.5*x + .75*y + 1) * .8
    grain = np.random.default_rng(1009).normal(0, .8, (HEIGHT, WIDTH))
    rgba = np.full((HEIGHT, WIDTH, 4), 255, dtype='uint8')
    for channel, value in enumerate((255, 250, 237)):
        rgba[:, :, channel] = np.clip(value - shading + grain, 0, 255)
    return Image.fromarray(rgba)


def centered(canvas, obj, x, y):
    canvas.alpha_composite(obj, (round(x-obj.width/2), round(y-obj.height/2)))


def flourish(draw, x, y, color):
    draw.line((x-18, y, x-4, y), fill=color)
    draw.line((x+4, y, x+18, y), fill=color)
    draw.polygon(((x,y-3),(x+2,y),(x,y+3),(x-2,y)), fill=color)


class DeckPrinter:
    def __init__(self, images, names, get_font):
        self.images = images
        self.names = names
        self.font = get_font
        self.paper = make_paper()

    @lru_cache(maxsize=None)
    def suit_symbol(self, suit, size, ink):
        holder = Image.new('RGBA', (2*size, 2*size))
        ImageDraw.Draw(holder).text((size,size), SYMBOLS[suit], font=self.font('sign',size), anchor='mm', fill=ink)
        return holder.crop(holder.getbbox())

    def draw_indices(self, card, rank, suit, ink):
        corner = Image.new('RGBA', (77,108))
        draw = ImageDraw.Draw(corner)
        joker = rank in ('BJ','SJ')
        title = {'BJ':'大', 'SJ':'小'}.get(rank, rank)
        if rank in PIPS:
            size = 51 if rank == '10' else 69
            font = self.font('numeral', size)
            left, top, right, bottom = font.getbbox(title)
            cx = 36
            draw.text((cx-(left+right)/2, 37-(top+bottom)/2), title, font=font, fill=ink)
            centered(corner, self.suit_symbol(suit, 42, ink), cx, 83)
        else:
            draw.text((32,33), title, font=self.font('chinese-bold' if joker else 'rank', 45 if joker else 58), fill=ink, anchor='mm')
            centered(corner, self.suit_symbol(suit, 34 if joker else 41, ink), 32, 78)
        card.alpha_composite(corner, (0,0))
        card.alpha_composite(corner.transpose(Image.Transpose.ROTATE_180), (WIDTH-corner.width, HEIGHT-corner.height))

    def draw_pips(self, card, rank, suit, ink):
        step, rows = PIPS[rank]
        assert sum(row.count('x') for row in rows) == int(rank)
        # The middle column only appears in 3-, 5-, 7- and 9-pip patterns.
        # All symbols stay upright, clear of both the illustration and the corner index.
        size = 30 if rank in ('7', '9') else 34
        sign = self.suit_symbol(suit, size, ink)
        for row_index, row in enumerate(rows):
            y = 214 + (row_index-(len(rows)-1)/2) * step
            for x, cell in zip((29, 52, 75), row):
                if cell == 'x':
                    centered(card, sign, x, y)

    def face(self, suit, rank):
        card = self.paper.copy()
        draw = ImageDraw.Draw(card)
        draw.rounded_rectangle((5,5,WIDTH-6,HEIGHT-6), radius=11, outline='#d9cdb1')
        ink = INK['H'] if rank == 'BJ' else INK[suit]
        numeric = rank in PIPS
        if numeric:
            self.draw_pips(card, rank, suit, ink)
            cx, cy, rx, ry, fit = 187, 196, 91, 115, (194,294)
        else:
            # Give broad creatures room for the horse, lance, horns and claws.
            fit = (250,298) if suit != 'J' else (213,301)
            cx, cy, rx, ry = 148, 199, 111, 125
        draw.ellipse((cx-rx,cy-ry,cx+rx,cy+ry), fill=WASH[suit])
        rim = (cx-rx-4,cy-ry-4,cx+rx+4,cy+ry+4)
        for start, stop in ((195,338),(19,120)):
            draw.arc(rim, start, stop, fill='#d6c6a7')
        sprite = ImageOps.contain(self.images[(suit,rank)], fit, Image.Resampling.LANCZOS)
        centered(card, sprite, cx, cy)
        flourish(draw, cx, 355, ACCENT[suit])
        name = self.names[rank]
        style = 'serif' if name.isascii() else 'chinese'
        draw.text((cx,374), name, font=self.font(style,16), fill=ink, anchor='mm')
        self.draw_indices(card, rank, suit, ink)
        return card

    def deck(self):
        order = [(s,r) for s in SUITS for r in RANKS] + [('J','SJ'),('J','BJ')]
        faces = {card: self.face(*card) for card in order}
        atlas = Image.new('RGB', (9*WIDTH,6*HEIGHT))
        for i, key in enumerate(order):
            atlas.paste(faces[key], (i%9*WIDTH,i//9*HEIGHT))
        return atlas, faces


def make_proofs(folder, faces, get_font):
    folder.mkdir(parents=True, exist_ok=True)
    gutter, cw, ch, header = 32, 218, 301, 89
    width = 4*gutter + 3*cw
    height = header + 3*(ch+gutter) + 25
    sheet = Image.new('RGBA',(width,height),'#1b302b')
    draw = ImageDraw.Draw(sheet)
    draw.rounded_rectangle((9,9,width-10,height-10),10,outline='#62715c')
    draw.text((width//2,39),'水晶亭的休戰日  ·  Q 版牌樣',font=get_font('chinese',28),fill='#efe2bd',anchor='mm')
    flourish(draw,width//2,66,'#b5a174')
    mask = Image.new('L',(cw,ch))
    ImageDraw.Draw(mask).rounded_rectangle((0,0,cw-1,ch-1),9,fill=255)
    shadows = Image.new('RGBA',sheet.size)
    shadow_draw = ImageDraw.Draw(shadows)
    for i in range(len(PROOF_CARDS)):
        x, y = gutter + (i%3)*(cw+gutter), header + (i//3)*(ch+gutter)
        shadow_draw.rounded_rectangle((x+2,y+5,x+cw+2,y+ch+5),10,fill=(8,17,15,140))
    sheet.alpha_composite(shadows.filter(ImageFilter.GaussianBlur(6)))
    for i, key in enumerate(PROOF_CARDS):
        x, y = gutter + (i%3)*(cw+gutter), header + (i//3)*(ch+gutter)
        sheet.paste(faces[key].resize((cw,ch), Image.Resampling.LANCZOS), (x,y), mask)
    sheet.convert('RGB').save(folder/'水晶亭的休戰日-Q版牌樣.png', optimize=True)

    full_mask = Image.new('L',(WIDTH,HEIGHT))
    ImageDraw.Draw(full_mask).rounded_rectangle((0,0,WIDTH-1,HEIGHT-1),11,fill=255)
    for rank, filename in [('6','水晶亭的休戰日-四張六.png'), ('7','水晶亭的休戰日-四張七.png')]:
        lineup = Image.new('RGB',(4*WIDTH+110,HEIGHT+44),'#1b302b')
        for i, suit in enumerate(SUITS):
            lineup.paste(faces[(suit,rank)], (22+i*(WIDTH+22),22), full_mask)
        lineup.save(folder/filename, optimize=True)
    make_full_proof(folder, faces, get_font)


def make_full_proof(folder, faces, get_font):
    """One row per suit; a separate index at the right holds the two jokers."""
    cw, ch, margin, gap = 139, 192, 28, 8
    header, row_label = 97, 35
    width = 2*margin + row_label + 14*(cw+gap) + 10
    height = header + 4*(ch+14) + margin
    canvas = Image.new('RGB',(width,height),'#1b302b')
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((10,10,width-11,height-11),10,outline='#62715c')
    draw.text((margin+4,45),'水晶亭的休戰日  ·  全副牌',font=get_font('chinese',32),fill='#efe2bd',anchor='lm')
    draw.text((width-margin-5,45),'54 款',font=get_font('chinese',21),fill='#c9bd9c',anchor='rm')
    draw.line((margin,72,width-margin,72),fill='#62715c')
    mask = Image.new('L',(cw,ch))
    ImageDraw.Draw(mask).rounded_rectangle((0,0,cw-1,ch-1),6,fill=255)
    for row, suit in enumerate(SUITS):
        y = header + row*(ch+14)
        draw.text((margin+row_label//2-4,y+ch//2),SYMBOLS[suit],font=get_font('sign',26),fill='#dccea8',anchor='mm')
        for col, rank in enumerate(RANKS):
            x = margin + row_label + col*(cw+gap)
            image = faces[(suit,rank)].resize((cw,ch), Image.Resampling.LANCZOS)
            canvas.paste(image,(x,y),mask)
    joker_x = margin + row_label + 13*(cw+gap) + 10
    draw.line((joker_x-10,header,joker_x-10,height-margin-15),fill='#62715c')
    for i, rank in enumerate(('BJ', 'SJ')):
        y = header + ch//2 + i*(ch+14)
        image = faces[('J',rank)].resize((cw,ch), Image.Resampling.LANCZOS)
        canvas.paste(image,(joker_x,y),mask)
    canvas.save(folder/'水晶亭的休戰日-全副牌.png',optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=ART)
    parser.add_argument('--output', type=Path, default=REPO/'public/fez-cards/deck.webp')
    parser.add_argument('--font-dir', type=Path, help='Optional font folder; defaults to system font lookup.')
    parser.add_argument('--proof-dir', type=Path, help='Also export a nine-card sample, the sixes, the sevens, and the full deck.')
    args = parser.parse_args()
    images, names = load_illustrations(args.source_dir)
    get_font = load_typefaces(args.font_dir)
    atlas, faces = DeckPrinter(images, names, get_font).deck()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, 'WEBP', quality=91, method=6)
    if args.proof_dir:
        make_proofs(args.proof_dir, faces, get_font)


if __name__ == '__main__':
    main()
