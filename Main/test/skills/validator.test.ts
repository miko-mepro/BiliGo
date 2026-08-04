import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateSkills } from '../../scripts/validate-skills.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function createFixture(files: Record<string, string | Uint8Array>): Promise<{ skillsRoot: string; outputPath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-skills-'))
  temporaryDirectories.push(root)
  const output = path.join(root, 'generated.ts')
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
  }
  return { skillsRoot: root, outputPath: output }
}

function skillDocument(name: string, body: string, activation = 'mandatory'): string {
  return `---\nname: ${name}\ndescription: Test skill\nmetadata:\n  activation: ${activation}\n---\n${body}\n`
}

describe('skill validation and generation', () => {
  it('validates metadata, links, activation modes, and deterministic output', async () => {
    const fixture = await createFixture({
      'mandatory-skill/SKILL.md': `${skillDocument('mandatory-skill', '[Read](references/guide.md)')}`,
      'mandatory-skill/references/guide.md': 'guide\n',
      'autonomous-skill/SKILL.md': skillDocument('autonomous-skill', 'optional body', 'autonomous'),
      'autonomous-skill/notes.txt': 'unreferenced text\n',
    })

    const first = await validateSkills(fixture)
    const firstOutput = await fs.readFile(fixture.outputPath, 'utf8')
    await validateSkills(fixture)
    const secondOutput = await fs.readFile(fixture.outputPath, 'utf8')

    expect(first.map((skill) => [skill.name, skill.activation])).toEqual([
      ['autonomous-skill', 'autonomous'],
      ['mandatory-skill', 'mandatory'],
    ])
    expect(firstOutput).toBe(secondOutput)
    expect(firstOutput).toContain('"references/guide.md": "guide\\n"')
    expect(firstOutput).toContain('"activation": "autonomous"')
  })

  it.each([
    ['missing frontmatter', 'body', /Missing YAML frontmatter/],
    ['malformed frontmatter', '---\nname: [broken\n---\nbody', /Malformed YAML frontmatter/],
    ['missing description', '---\nname: test-skill\ndescription:\nmetadata:\n  activation: mandatory\n---\nbody', /Non-empty description/],
    ['empty body', skillDocument('test-skill', '   '), /empty Markdown body/],
    ['invalid activation', skillDocument('test-skill', 'body', 'on-demand'), /metadata\.activation/],
    ['missing link', skillDocument('test-skill', '[Missing](references/nope.md)'), /does not exist/],
    ['traversal link', skillDocument('test-skill', '[Escape](../outside.md)'), /Traversal resource link/],
    ['absolute link', skillDocument('test-skill', '[Escape](/outside.md)'), /Absolute resource link/],
    ['SKILL.md link', skillDocument('test-skill', '[Instructions](SKILL.md)'), /SKILL\.md cannot be referenced/],
  ])('rejects %s', async (_caseName, document, expectedError) => {
    const fixture = await createFixture({ 'test-skill/SKILL.md': document })
    await expect(validateSkills(fixture)).rejects.toThrow(expectedError)
  })

  it('rejects names that do not match their directory', async () => {
    const fixture = await createFixture({
      'directory-name/SKILL.md': skillDocument('different-name', 'body'),
    })
    await expect(validateSkills(fixture)).rejects.toThrow(/must match directory/)
  })

  it('rejects duplicate skill names discovered recursively', async () => {
    const fixture = await createFixture({
      'group-one/shared-name/SKILL.md': skillDocument('shared-name', 'one'),
      'group-two/shared-name/SKILL.md': skillDocument('shared-name', 'two'),
    })
    await expect(validateSkills(fixture)).rejects.toThrow(/Duplicate skill name/)
  })

  it('rejects a root skill directory without SKILL.md', async () => {
    const fixture = await createFixture({
      'incomplete-skill/references/guide.md': 'guide\n',
    })
    await expect(validateSkills(fixture)).rejects.toThrow(/does not contain SKILL\.md/)
  })

  it('rejects unsupported resources and oversized resources', async () => {
    const scriptFixture = await createFixture({
      'test-skill/SKILL.md': skillDocument('test-skill', 'body'),
      'test-skill/scripts/run.sh': '#!/bin/sh\n',
    })
    await expect(validateSkills(scriptFixture)).rejects.toThrow(/Unsupported or executable resource/)

    const oversizedFixture = await createFixture({
      'test-skill/SKILL.md': skillDocument('test-skill', 'body'),
      'test-skill/references/large.txt': 'x'.repeat(64 * 1024 + 1),
    })
    await expect(validateSkills(oversizedFixture)).rejects.toThrow(/exceeds 65536 bytes/)

    const oversizedSkillFixture = await createFixture({
      'test-skill/SKILL.md': skillDocument('test-skill', Array.from({ length: 495 }, () => 'line').join('\n')),
    })
    await expect(validateSkills(oversizedSkillFixture)).rejects.toThrow(/exceeds 500 lines/)

    const binaryFixture = await createFixture({
      'test-skill/SKILL.md': skillDocument('test-skill', 'body'),
      'test-skill/references/binary.txt': Uint8Array.from([0, 255, 1]),
    })
    await expect(validateSkills(binaryFixture)).rejects.toThrow(/Binary or invalid UTF-8/)
  })

  it('does not overwrite an existing generated file when validation fails', async () => {
    const fixture = await createFixture({
      'test-skill/SKILL.md': skillDocument('test-skill', '[Missing](missing.md)'),
    })
    await fs.writeFile(fixture.outputPath, 'previous output\n')

    await expect(validateSkills(fixture)).rejects.toThrow(/does not exist/)
    await expect(fs.readFile(fixture.outputPath, 'utf8')).resolves.toBe('previous output\n')
  })
})
