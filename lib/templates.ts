export type TemplateId = 'playground' | 'blank' | 'mindmap' | 'flowchart' | 'architecture' | 'kanban' | 'weekly';
export const templates: { id: TemplateId; name: string; description: string; color: string; category: string }[] = [
  { id: 'blank', name: 'A fresh canvas', description: 'Make room for anything.', color: '#e8edf3', category: 'Start fresh' },
  { id: 'mindmap', name: 'Mind map', description: 'Give your ideas a little structure.', color: '#ffe69b', category: 'Brainstorm' },
  { id: 'flowchart', name: 'Flowchart', description: 'Find the path from A to B.', color: '#c4e2fc', category: 'Diagram' },
  { id: 'architecture', name: 'System architecture', description: 'See how the pieces fit together.', color: '#d8cef7', category: 'Diagram' },
  { id: 'kanban', name: 'Project board', description: 'Move ideas into done.', color: '#cfe7d1', category: 'Plan' },
  { id: 'weekly', name: 'Weekly planner', description: 'A clearer picture of your week.', color: '#f6d3ce', category: 'Plan' },
];
const base = { strokeColor: '#343a46', strokeWidth: 1.5, roughness: 1, fillStyle: 'solid' };
const text = (id: string, x: number, y: number, value: string, size = 24, color = '#343a46') => ({ id, type: 'text', x, y, text: value, fontSize: size, fontFamily: 5, strokeColor: color });
const box = (id: string, x: number, y: number, w: number, h: number, label: string, color: string, extra: any = {}) => ({ ...base, id, type: 'rectangle', x, y, width: w, height: h, backgroundColor: color, roundness: { type: 3 }, label: { text: label, fontSize: 22, fontFamily: 5, strokeColor: '#343a46' }, ...extra });
const arrow = (id: string, x: number, y: number, points: number[][], from?: string, to?: string, color = '#677287') => ({ ...base, id, type: 'arrow', x, y, points, strokeColor: color, endArrowhead: 'arrow', ...(from ? { start: { id: from } } : {}), ...(to ? { end: { id: to } } : {}) });
export function templateSkeleton(id: TemplateId): any[] {
  if (id === 'blank') return [];
  if (id === 'playground') return [
    text('headline', 100, 40, 'Good things start\nwith a little scribble.', 40),
    text('tag', 690, 75, 'a space to think out loud', 21, '#557e9f'),
    box('idea', 365, 295, 290, 95, 'Your next big idea', '#ffe29a', { strokeColor: '#ad852d', roughness: 1.6 }),
    box('whatif', 50, 225, 190, 82, 'What if…', '#f7d8d3', { strokeColor: '#aa7971' }),
    box('explore', 785, 215, 190, 82, 'Explore', '#cfe6f6', { strokeColor: '#7297b3' }),
    box('make', 115, 475, 220, 82, 'Make it happen', '#d7e8d2', { strokeColor: '#829c78' }),
    box('connect', 775, 455, 235, 82, 'Connect the dots', '#e0d9f4', { strokeColor: '#9582b3' }),
    arrow('a1', 365, 330, [[0, 0], [-125, -65]], 'idea', 'whatif'),
    arrow('a2', 655, 325, [[0, 0], [130, -70]], 'idea', 'explore'),
    arrow('a3', 400, 390, [[0, 0], [-140, 85]], 'idea', 'make'),
    arrow('a4', 620, 390, [[0, 0], [155, 100]], 'idea', 'connect'),
    box('note', 440, 525, 218, 155, 'No perfect ideas.\nJust possibilities.', '#fff0b6', { angle: -0.04, roundness: null, strokeColor: '#d8bd66', strokeWidth: 1 }),
    text('hint', 85, 645, 'Double-click any text to make it yours.', 19, '#8991a2'),
  ];
  if (id === 'mindmap') return [
    text('title', 60, 40, 'One idea. Endless possibilities.', 36),
    box('core', 375, 270, 235, 95, 'The big idea', '#ffe29a'),
    box('why', 55, 160, 210, 85, 'Why it matters', '#f7d8d3'),
    box('who', 735, 160, 210, 85, 'Who is it for?', '#cfe6f6'),
    box('how', 55, 440, 210, 85, 'How it works', '#d7e8d2'),
    box('next', 735, 440, 210, 85, 'First steps', '#e0d9f4'),
    arrow('a1', 375, 290, [[0, 0], [-110, -85]], 'core', 'why'),
    arrow('a2', 610, 290, [[0, 0], [125, -85]], 'core', 'who'),
    arrow('a3', 375, 345, [[0, 0], [-110, 130]], 'core', 'how'),
    arrow('a4', 610, 345, [[0, 0], [125, 130]], 'core', 'next'),
  ];
  if (id === 'flowchart') return [
    text('title', 55, 30, 'Map the way forward', 36),
    box('start', 80, 280, 155, 80, 'Start', '#d7e8d2', { type: 'ellipse' }),
    box('step', 320, 280, 195, 80, 'Try an idea', '#cfe6f6'),
    box('decision', 600, 230, 190, 180, 'Does it\nwork?', '#ffe29a', { type: 'diamond' }),
    box('done', 900, 270, 170, 90, 'Make it real', '#d7e8d2'),
    box('iterate', 595, 540, 205, 85, 'Try another way', '#f7d8d3'),
    arrow('a1', 235, 320, [[0, 0], [85, 0]], 'start', 'step'),
    arrow('a2', 515, 320, [[0, 0], [85, 0]], 'step', 'decision'),
    arrow('a3', 790, 320, [[0, 0], [110, 0]], 'decision', 'done'),
    arrow('a4', 695, 410, [[0, 0], [0, 130]], 'decision', 'iterate'),
    arrow('a5', 595, 580, [[0, 0], [-180, 0], [-180, -220]], 'iterate', 'step'),
    text('yes', 820, 277, 'Yes', 20), text('no', 710, 470, 'Not yet', 20),
  ];
  if (id === 'architecture') return [
    text('title', 55, 25, 'A system, at a glance', 36),
    box('web', 70, 160, 205, 85, 'Web client', '#cfe6f6'),
    box('mobile', 70, 380, 205, 85, 'Mobile app', '#cfe6f6'),
    box('api', 420, 270, 225, 110, 'API gateway', '#e0d9f4'),
    box('service', 800, 145, 220, 100, 'App service', '#ffe29a'),
    box('db', 800, 400, 220, 110, 'Database', '#d7e8d2'),
    arrow('a1', 275, 205, [[0, 0], [145, 100]], 'web', 'api'),
    arrow('a2', 275, 420, [[0, 0], [145, -65]], 'mobile', 'api'),
    arrow('a3', 645, 290, [[0, 0], [155, -95]], 'api', 'service'),
    arrow('a4', 910, 245, [[0, 0], [0, 155]], 'service', 'db'),
    box('note', 390, 510, 260, 130, 'Keep the interfaces simple.\nLet each piece do one thing.', '#fff0b6', { roundness: null, strokeWidth: 1 }),
  ];
  if (id === 'kanban') return [
    text('title', 65, 20, 'Small steps. Real progress.', 36),
    ...['To do', 'In progress', 'Done'].flatMap((title, i) => [
      box(`col${i}`, 55 + i * 350, 120, 305, 540, '', ['#f0f3f8', '#fff7dc', '#edf5ed'][i], { strokeColor: '#d5dbe3', roughness: 0, roundness: { type: 3 } }),
      text(`heading${i}`, 90 + i * 350, 145, title, 25),
    ]),
    box('task1', 78, 220, 257, 125, 'Collect inspiration', '#cfe6f6', { roundness: null }),
    box('task2', 78, 375, 257, 125, 'Sketch a few directions', '#e0d9f4', { roundness: null }),
    box('task3', 428, 220, 257, 125, 'Build the first version', '#ffe9a8', { roundness: null }),
    box('task4', 778, 220, 257, 125, 'Define the problem', '#d7e8d2', { roundness: null }),
  ];
  return [
    text('title', 50, 25, 'A little intention for the week', 36),
    ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].flatMap((day, i) => [
      box(`day${i}`, 35 + i * 230, 130, 210, 425, '', ['#fff4cf', '#edf4fc', '#f2edfc', '#edf5ed', '#fcefed'][i], { roughness: 0, strokeColor: '#d5dbe3' }),
      text(`heading${i}`, 58 + i * 230, 154, day, 23),
    ]),
    box('focus', 55, 220, 170, 115, 'Set one\nclear goal', '#ffe49b', { roundness: null }),
    text('reflection', 60, 615, 'One thing I want to make time for:', 25),
  ];
}
