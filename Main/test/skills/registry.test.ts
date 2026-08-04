import { describe, expect, it } from 'vitest'
import {
  getMandatorySkillBodies,
  listSkillMetadata,
  loadSkillBody,
  readSkillResource,
} from '../../src/skills/registry.js'

describe('bundled skill registry', () => {
  it('lists metadata without putting resource bodies in metadata', () => {
    const metadata = listSkillMetadata()
    const writingSkill = metadata.find((skill) => skill.name === 'bili-writing-format')

    expect(writingSkill).toBeDefined()
    expect(writingSkill?.activation).toBe('mandatory')
    expect(writingSkill?.resources).toEqual(['references/clarification.md', 'references/video-reply.md'])
    expect(writingSkill).not.toHaveProperty('body')
  })

  it('loads the frontmatter-free mandatory body and exact bold example', () => {
    const result = loadSkillBody('bili-writing-format')
    expect(result.success).toBe(true)
    if (result.success === true) {
      expect(result.data).not.toContain('metadata:')
      expect(result.data).toContain('「**红叔**」')
      expect(result.data).toContain('禁止使用 `**「红叔」**`')
    }
    expect(getMandatorySkillBodies()).toHaveLength(1)
  })

  it('loads only the requested progressive resource', () => {
    const result = readSkillResource('bili-writing-format', 'references/video-reply.md')
    expect(result.success).toBe(true)
    if (result.success === true) {
      expect(result.data).toContain('# 视频推荐回复模板')
      expect(result.data).not.toContain('metadata:')
    }

    const clarification = readSkillResource('bili-writing-format', 'references/clarification.md')
    expect(clarification.success).toBe(true)
  })

  it.each([
    ['../SKILL.md', 'RESOURCE_PATH_TRAVERSAL'],
    ['..\\outside.txt', 'INVALID_RESOURCE_PATH'],
    ['/etc/passwd', 'INVALID_RESOURCE_PATH'],
    ['C:/outside.txt', 'INVALID_RESOURCE_PATH'],
    ['SKILL.md', 'SKILL_FILE_NOT_READABLE'],
    ['references/video-reply.md/../../SKILL.md', 'RESOURCE_PATH_TRAVERSAL'],
    ['references/video-reply.sh', 'UNSUPPORTED_RESOURCE_TYPE'],
  ])('rejects restricted resource path %s', (resourcePath, code) => {
    const result = readSkillResource('bili-writing-format', resourcePath)
    expect(result).toEqual(expect.objectContaining({ success: false, code }))
  })

  it('returns structured errors for unknown skills and resources', () => {
    expect(loadSkillBody('missing-skill')).toEqual(expect.objectContaining({
      success: false,
      code: 'SKILL_NOT_FOUND',
    }))
    expect(readSkillResource('bili-writing-format', 'references/missing.md')).toEqual(expect.objectContaining({
      success: false,
      code: 'RESOURCE_NOT_FOUND',
    }))
  })
})
