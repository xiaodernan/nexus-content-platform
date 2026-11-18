import { BIBLE_CHAPTERS, BIBLE_ECHOES } from './src/world-bible/generated';
console.log('chapters:', BIBLE_CHAPTERS.length, 'echoes:', BIBLE_ECHOES.length);
console.log('slugs tail:', BIBLE_ECHOES.slice(-4).map((e) => e.slug));
console.log('find echo-126:', JSON.stringify(BIBLE_ECHOES.find((e) => e.slug === 'echo-126-the-forty-fifth-convocation')?.titleZh));
