import { buildCsvRow, csvEscape } from './csv.util';

describe('csvEscape — proteção contra CSV/formula injection (seção 72 da Fase 4)', () => {
  it.each(['=SOMA(A1:A9)', '+1+1', '-2+3', '@SUM(1,2)'])(
    'prefixa com apóstrofo valores que começam com caractere de fórmula: %s',
    (value) => {
      expect(csvEscape(value)).toBe(`'${value}`);
    },
  );

  it('não altera valores normais', () => {
    expect(csvEscape('Bolsa Viena')).toBe('Bolsa Viena');
    expect(csvEscape('123.45')).toBe('123.45');
  });

  it('continua escapando aspas e o delimitador (;) mesmo em valores com prefixo de fórmula', () => {
    const value = '=A1;B1';
    const escaped = csvEscape(value);
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped).toContain("'=A1;B1");
  });

  it('escapa aspas duplas duplicando-as', () => {
    expect(csvEscape('Diz "oi"')).toBe('"Diz ""oi"""');
  });
});

describe('buildCsvRow', () => {
  it('junta valores com ; e trata null/undefined como string vazia', () => {
    expect(buildCsvRow(['a', null, undefined, 'd'])).toBe('a;;;d');
  });

  it('protege cada célula da linha individualmente', () => {
    expect(buildCsvRow(['=cmd', 'normal'])).toBe("'=cmd;normal");
  });
});
