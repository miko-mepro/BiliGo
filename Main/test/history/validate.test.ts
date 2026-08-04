// R-1 历史索引数据入口校验的单元测试。
// 覆盖修复方案「测试建议」章节列出的全部字段降级与丢弃路径。
import { describe, expect, it } from 'vitest';
import { sanitizeHistoryIndex } from '../../src/lib/history/validate.js';
import type { ConversationRecord } from '../../src/lib/shared-types/index.js';

/** 构造一条各字段均合法的记录，便于按需覆盖单个字段做脏数据测试 */
function makeValidRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a',
    title: 't',
    titleFinal: false,
    createdAt: 1,
    lastActiveAt: 2,
    messageCount: 3,
    ...overrides,
  };
}

describe('sanitizeHistoryIndex', () => {
  describe('顶层输入校验', () => {
    it('空数组原样返回空数组', () => {
      expect(sanitizeHistoryIndex([])).toEqual([]);
    });

    // 非数组输入（存储损坏）统一降级为空数组，保证调用方拿到的一定是数组
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['对象', {}],
      ['字符串', 'string'],
      ['数字', 42],
      ['布尔值', true],
    ])('非数组值（%s）返回空数组', (_label, input) => {
      expect(sanitizeHistoryIndex(input)).toEqual([]);
    });
  });

  describe('正常记录', () => {
    it('全字段合法时原样返回', () => {
      const valid: ConversationRecord = {
        id: 'a',
        title: 't',
        titleFinal: false,
        createdAt: 1,
        lastActiveAt: 2,
        messageCount: 3,
      };
      expect(sanitizeHistoryIndex([valid])).toEqual([valid]);
    });

    it('title 为空字符串时保留空字符串（合法值，非降级）', () => {
      const result = sanitizeHistoryIndex([makeValidRecord({ title: '' })]);
      expect(result[0].title).toBe('');
    });

    it('titleFinal 为 true 时保留 true', () => {
      const result = sanitizeHistoryIndex([makeValidRecord({ titleFinal: true })]);
      expect(result[0].titleFinal).toBe(true);
    });

    it('数值字段为 0 时保留 0（0 合法，不应被误判为非法）', () => {
      const result = sanitizeHistoryIndex([
        makeValidRecord({ createdAt: 0, lastActiveAt: 0, messageCount: 0 }),
      ]);
      expect(result[0]).toMatchObject({ createdAt: 0, lastActiveAt: 0, messageCount: 0 });
    });
  });

  describe('title 降级为空字符串（可降级失败）', () => {
    it.each([
      ['null', null],
      ['数字', 123],
      ['对象', {}],
      ['数组', ['x']],
      ['布尔值', true],
      ['undefined', undefined],
    ])('title 为 %s 时降级为空字符串', (_label, title) => {
      const result = sanitizeHistoryIndex([makeValidRecord({ title })]);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('');
    });

    it('title 字段缺失时降级为空字符串', () => {
      const withoutTitle = makeValidRecord();
      delete withoutTitle.title;
      const result = sanitizeHistoryIndex([withoutTitle]);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('');
    });

    it('降级后的 title 可安全调用 toLowerCase（R-1 崩溃入口回归断言）', () => {
      const result = sanitizeHistoryIndex([makeValidRecord({ title: null })]);
      expect(() => result[0].title.toLowerCase()).not.toThrow();
    });
  });

  describe('id 非法时丢弃整条记录（致命失败）', () => {
    it.each([
      ['null', null],
      ['空字符串', ''],
      ['数字', 1],
      ['对象', {}],
      ['布尔值', false],
      ['undefined', undefined],
    ])('id 为 %s 时记录被丢弃', (_label, id) => {
      expect(sanitizeHistoryIndex([makeValidRecord({ id })])).toEqual([]);
    });

    it('id 字段缺失时记录被丢弃', () => {
      const withoutId = makeValidRecord();
      delete withoutId.id;
      expect(sanitizeHistoryIndex([withoutId])).toEqual([]);
    });
  });

  describe('titleFinal 降级为 false', () => {
    it.each([
      ['字符串 "true"', 'true'],
      ['数字 1', 1],
      ['null', null],
      ['undefined', undefined],
      ['对象', {}],
    ])('titleFinal 为 %s 时降级为 false', (_label, titleFinal) => {
      const result = sanitizeHistoryIndex([makeValidRecord({ titleFinal })]);
      expect(result[0].titleFinal).toBe(false);
    });
  });

  describe('数值字段降级为 0', () => {
    // createdAt / lastActiveAt / messageCount 共用同一套数值校验规则
    const numericFields = ['createdAt', 'lastActiveAt', 'messageCount'] as const;
    const invalidNumbers: Array<[string, unknown]> = [
      ['字符串', 'x'],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
      ['负数', -1],
      ['null', null],
      ['undefined', undefined],
      ['对象', {}],
      ['布尔值', true],
    ];

    for (const field of numericFields) {
      it.each(invalidNumbers)(`${field} 为 %s 时降级为 0`, (_label, value) => {
        const result = sanitizeHistoryIndex([makeValidRecord({ [field]: value })]);
        expect(result[0][field]).toBe(0);
      });

      it(`${field} 字段缺失时降级为 0`, () => {
        const record = makeValidRecord();
        delete record[field];
        const result = sanitizeHistoryIndex([record]);
        expect(result[0][field]).toBe(0);
      });
    }
  });

  describe('非对象元素丢弃', () => {
    it.each([
      ['null', null],
      ['数字', 1],
      ['字符串', 'x'],
      ['布尔值', true],
      ['undefined', undefined],
      ['数组', []],
    ])('元素为 %s 时被丢弃，保留同数组内的有效记录', (_label, element) => {
      const result = sanitizeHistoryIndex([element, makeValidRecord({ id: 'a' })]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });
  });

  describe('混合脏数据', () => {
    it('保留可降级记录、丢弃致命失败记录，且保持原有顺序', () => {
      const result = sanitizeHistoryIndex([
        null,
        makeValidRecord({ id: 'a', title: null }),
        makeValidRecord({ id: '', title: 't' }),
        makeValidRecord({ id: 'b', title: 'ok' }),
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'a', title: '' });
      expect(result[1]).toMatchObject({ id: 'b', title: 'ok' });
    });

    it('单条记录多个字段同时非法时逐字段独立降级', () => {
      const result = sanitizeHistoryIndex([
        { id: 'a', title: 123, titleFinal: 'yes', createdAt: 'x', lastActiveAt: NaN, messageCount: -5 },
      ]);

      expect(result[0]).toEqual({
        id: 'a',
        title: '',
        titleFinal: false,
        createdAt: 0,
        lastActiveAt: 0,
        messageCount: 0,
      });
    });
  });

  describe('纯净性约束', () => {
    it('不修改输入数组本身', () => {
      const input = [makeValidRecord({ id: 'a', title: null })];
      const snapshot = JSON.parse(JSON.stringify(input));
      sanitizeHistoryIndex(input);
      expect(input).toEqual(snapshot);
    });

    it('不修改输入数组中的记录对象（返回新对象）', () => {
      const record = makeValidRecord({ id: 'a', title: null });
      const result = sanitizeHistoryIndex([record]);
      expect(record.title).toBeNull();
      expect(result[0]).not.toBe(record);
    });

    it('丢弃非法记录不影响输入数组长度', () => {
      const input = [null, makeValidRecord()];
      sanitizeHistoryIndex(input);
      expect(input).toHaveLength(2);
    });

    it('剥离契约外的多余字段，只返回 ConversationRecord 的六个字段', () => {
      const result = sanitizeHistoryIndex([makeValidRecord({ unexpectedField: 'x' })]);
      expect(Object.keys(result[0]).sort()).toEqual([
        'createdAt',
        'id',
        'lastActiveAt',
        'messageCount',
        'title',
        'titleFinal',
      ]);
    });
  });
});
