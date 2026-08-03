import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'], theme: { extend: { colors: { fundesco: { forest:'#10483D', green:'#178C72', lime:'#B5D334', gold:'#F2B705', cream:'#F7F2E8', ink:'#17231F' } } } }, plugins: [] } satisfies Config;
