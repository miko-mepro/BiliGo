import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..')
const DEFAULT_SKILLS_ROOT = path.join(PROJECT_ROOT, '.agents', 'skills')
const DEFAULT_OUTPUT_PATH = path.join(PROJECT_ROOT, 'src', 'skills', 'generated-skill-registry.ts')

const MAX_SKILL_LINES = 500
const MAX_RESOURCE_BYTES = 64 * 1024
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SUPPORTED_RESOURCE_EXTENSIONS = new Set([
  '.csv',
  '.json',
  '.md',
  '.mdx',
  '.toml',
  '.tsv',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])

/**
 * @typedef {'mandatory' | 'autonomous'} SkillActivation
 */

/**
 * @typedef {{
 *   skillsRoot?: string,
 *   outputPath?: string,
 * }} ValidationOptions
 */

/**
 * @typedef {{
 *   path: string,
 *   content: string,
 * }} ValidatedResource
 */

/**
 * @typedef {{
 *   sourcePath: string,
 *   directoryPath: string,
 *   name: string,
 *   description: string,
 *   activation: SkillActivation,
 *   body: string,
 *   resources: ValidatedResource[],
 * }} ValidatedSkill
 */

export class SkillValidationError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message)
    this.name = 'SkillValidationError'
  }
}

/**
 * Validate every skill below a root and write the generated runtime registry.
 * The output file is written only after discovery and all content checks pass.
 *
 * @param {ValidationOptions} [options]
 * @returns {Promise<ValidatedSkill[]>}
 */
export async function validateSkills(options = {}) {
  const skillsRoot = path.resolve(options.skillsRoot ?? DEFAULT_SKILLS_ROOT)
  const outputPath = path.resolve(options.outputPath ?? DEFAULT_OUTPUT_PATH)
  await assertDirectory(skillsRoot, 'Skills root')
  await assertRootSkillDirectories(skillsRoot)

  const skillDocumentPaths = []
  await collectSkillDocuments(skillsRoot, skillDocumentPaths)
  skillDocumentPaths.sort(comparePaths)
  if (skillDocumentPaths.length === 0) {
    throw new SkillValidationError(`No SKILL.md files found under ${skillsRoot}`)
  }

  const skillDirectories = new Set(skillDocumentPaths.map((filePath) => path.dirname(filePath)))
  const seenNames = new Map()
  const skills = []

  for (const sourcePath of skillDocumentPaths) {
    const directoryPath = path.dirname(sourcePath)
    const content = await readUtf8File(sourcePath, 'SKILL.md')
    const parsed = parseSkillDocument(content, sourcePath)

    const previousPath = seenNames.get(parsed.name)
    if (previousPath) {
      throw new SkillValidationError(
        `Duplicate skill name "${parsed.name}" in ${previousPath} and ${sourcePath}`,
      )
    }
    seenNames.set(parsed.name, sourcePath)

    const resourceFiles = []
    await collectResourceFiles(directoryPath, directoryPath, skillDirectories, resourceFiles)
    resourceFiles.sort((left, right) => compareStrings(left.path, right.path))

    const resources = []
    for (const resourceFile of resourceFiles) {
      const extension = path.extname(resourceFile.path).toLowerCase()
      if (!SUPPORTED_RESOURCE_EXTENSIONS.has(extension)) {
        throw new SkillValidationError(
          `Unsupported or executable resource "${resourceFile.path}" in ${sourcePath}`,
        )
      }

      const resourceContent = await readUtf8File(resourceFile.absolutePath, resourceFile.path)
      const byteLength = Buffer.byteLength(resourceContent, 'utf8')
      if (byteLength > MAX_RESOURCE_BYTES) {
        throw new SkillValidationError(
          `Resource "${resourceFile.path}" in ${sourcePath} exceeds ${MAX_RESOURCE_BYTES} bytes`,
        )
      }
      resources.push({ path: resourceFile.path, content: resourceContent })
    }

    validateReferencedResources(parsed.body, resources, sourcePath)
    skills.push({
      sourcePath,
      directoryPath,
      name: parsed.name,
      description: parsed.description,
      activation: parsed.activation,
      body: parsed.body,
      resources,
    })
  }

  const generatedSource = generateRegistrySource(skills)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, generatedSource, 'utf8')
  return skills
}

/**
 * Parse and validate one SKILL.md document.
 *
 * @param {string} content
 * @param {string} sourcePath
 * @returns {{name: string, description: string, activation: SkillActivation, body: string}}
 */
export function parseSkillDocument(content, sourcePath) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    throw new SkillValidationError(`Missing YAML frontmatter in ${sourcePath}`)
  }
  const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
  if (lineCount > MAX_SKILL_LINES) {
    throw new SkillValidationError(`SKILL.md at ${sourcePath} exceeds ${MAX_SKILL_LINES} lines`)
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && ['---', '...'].includes(line.trim()))
  if (closingIndex < 0) {
    throw new SkillValidationError(`Unclosed YAML frontmatter in ${sourcePath}`)
  }

  const frontmatterText = lines.slice(1, closingIndex).join('\n')
  const body = lines.slice(closingIndex + 1).join('\n').trim()
  if (!body) {
    throw new SkillValidationError(`SKILL.md at ${sourcePath} has an empty Markdown body`)
  }

  const document = parseDocument(frontmatterText, { prettyErrors: true, strict: true })
  if (document.errors.length > 0) {
    const detail = document.errors.map((error) => error.message).join('; ')
    throw new SkillValidationError(`Malformed YAML frontmatter in ${sourcePath}: ${detail}`)
  }

  const frontmatter = document.toJS()
  if (!isRecord(frontmatter)) {
    throw new SkillValidationError(`YAML frontmatter in ${sourcePath} must be an object`)
  }

  const directoryName = path.basename(path.dirname(sourcePath))
  if (typeof frontmatter.name !== 'string' || !frontmatter.name.trim()) {
    throw new SkillValidationError(`Skill name is required in ${sourcePath}`)
  }
  if (!SKILL_NAME_PATTERN.test(frontmatter.name) || frontmatter.name.length > 64) {
    throw new SkillValidationError(`Invalid skill name "${frontmatter.name}" in ${sourcePath}`)
  }
  if (frontmatter.name !== directoryName) {
    throw new SkillValidationError(
      `Skill name "${frontmatter.name}" must match directory "${directoryName}" in ${sourcePath}`,
    )
  }
  if (typeof frontmatter.description !== 'string' || !frontmatter.description.trim()) {
    throw new SkillValidationError(`Non-empty description is required in ${sourcePath}`)
  }

  if (!isRecord(frontmatter.metadata) || !['mandatory', 'autonomous'].includes(frontmatter.metadata.activation)) {
    throw new SkillValidationError(
      `metadata.activation must be "mandatory" or "autonomous" in ${sourcePath}`,
    )
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description.trim(),
    activation: frontmatter.metadata.activation,
    body,
  }
}

/**
 * @param {string} directoryPath
 * @param {string} label
 * @returns {Promise<void>}
 */
async function assertDirectory(directoryPath, label) {
  let stats
  try {
    stats = await fs.lstat(directoryPath)
  } catch (error) {
    throw new SkillValidationError(`${label} does not exist at ${directoryPath}: ${errorMessage(error)}`)
  }
  if (!stats.isDirectory()) {
    throw new SkillValidationError(`${label} is not a directory: ${directoryPath}`)
  }
}

/**
 * Root-level directories are skill packages or categories containing skill packages.
 * A directory with no nested SKILL.md is otherwise silently ignored by discovery.
 *
 * @param {string} skillsRoot
 * @returns {Promise<void>}
 */
async function assertRootSkillDirectories(skillsRoot) {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const directoryPath = path.join(skillsRoot, entry.name)
    if (!(await containsSkillDocument(directoryPath))) {
      throw new SkillValidationError(`Skill directory ${directoryPath} does not contain SKILL.md`)
    }
  }
}

/**
 * @param {string} directoryPath
 * @returns {Promise<boolean>}
 */
async function containsSkillDocument(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isSymbolicLink()) {
      throw new SkillValidationError(`Symbolic links are not allowed in skills: ${entryPath}`)
    }
    if (entry.isFile() && entry.name === 'SKILL.md') {
      return true
    }
    if (entry.isDirectory() && (await containsSkillDocument(entryPath))) {
      return true
    }
  }
  return false
}

/**
 * @param {string} directoryPath
 * @param {string[]} result
 * @returns {Promise<void>}
 */
async function collectSkillDocuments(directoryPath, result) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  entries.sort((left, right) => compareStrings(left.name, right.name))
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isSymbolicLink()) {
      throw new SkillValidationError(`Symbolic links are not allowed in skills: ${entryPath}`)
    }
    if (entry.isDirectory()) {
      await collectSkillDocuments(entryPath, result)
      continue
    }
    if (entry.isFile() && entry.name === 'SKILL.md') {
      result.push(entryPath)
    }
  }
}

/**
 * @typedef {{absolutePath: string, path: string}} ResourceFile
 */

/**
 * @param {string} currentPath
 * @param {string} skillDirectory
 * @param {Set<string>} skillDirectories
 * @param {ResourceFile[]} result
 * @returns {Promise<void>}
 */
async function collectResourceFiles(currentPath, skillDirectory, skillDirectories, result) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  entries.sort((left, right) => compareStrings(left.name, right.name))
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name)
    if (entry.isSymbolicLink()) {
      throw new SkillValidationError(`Symbolic links are not allowed in skills: ${entryPath}`)
    }
    if (entry.isDirectory()) {
      if (entryPath !== skillDirectory && skillDirectories.has(entryPath)) {
        continue
      }
      await collectResourceFiles(entryPath, skillDirectory, skillDirectories, result)
      continue
    }
    if (entry.isFile() && entry.name !== 'SKILL.md') {
      result.push({
        absolutePath: entryPath,
        path: toPosixPath(path.relative(skillDirectory, entryPath)),
      })
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} label
 * @returns {Promise<string>}
 */
async function readUtf8File(filePath, label) {
  let buffer
  try {
    buffer = await fs.readFile(filePath)
  } catch (error) {
    throw new SkillValidationError(`Unable to read ${label} at ${filePath}: ${errorMessage(error)}`)
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    if (text.includes('\u0000')) {
      throw new Error('contains NUL bytes')
    }
    return text
  } catch (error) {
    throw new SkillValidationError(`Binary or invalid UTF-8 content is not allowed at ${filePath}: ${errorMessage(error)}`)
  }
}

/**
 * @param {string} body
 * @param {ValidatedResource[]} resources
 * @param {string} sourcePath
 * @returns {void}
 */
function validateReferencedResources(body, resources, sourcePath) {
  const resourcePaths = new Set(resources.map((resource) => resource.path))
  for (const rawTarget of extractMarkdownLinkTargets(body)) {
    const target = normalizeLinkedResourcePath(rawTarget, sourcePath)
    if (target === null) {
      continue
    }
    if (!resourcePaths.has(target)) {
      throw new SkillValidationError(
        `Referenced resource "${target}" does not exist in ${sourcePath}`,
      )
    }
  }
}

/**
 * @param {string} body
 * @returns {string[]}
 */
function extractMarkdownLinkTargets(body) {
  const targets = []
  const inlineLinkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/gu
  const referenceLinkPattern = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|[^\s]+)(?:\s+.*)?$/gmu

  for (const match of body.matchAll(inlineLinkPattern)) {
    const target = match[1]
    if (target) {
      targets.push(stripAngleBrackets(target))
    }
  }
  for (const match of body.matchAll(referenceLinkPattern)) {
    const target = match[1]
    if (target) {
      targets.push(stripAngleBrackets(target))
    }
  }
  return targets
}

/**
 * @param {string} target
 * @param {string} sourcePath
 * @returns {string | null}
 */
function normalizeLinkedResourcePath(target, sourcePath) {
  const trimmedTarget = target.trim()
  if (!trimmedTarget || trimmedTarget.startsWith('#')) {
    return null
  }
  if (/^(?:https?|mailto):/iu.test(trimmedTarget)) {
    return null
  }

  let decodedTarget
  try {
    decodedTarget = decodeURIComponent(trimmedTarget)
  } catch {
    throw new SkillValidationError(`Invalid percent-encoded resource link "${trimmedTarget}" in ${sourcePath}`)
  }
  if (
    decodedTarget.startsWith('/') ||
    decodedTarget.startsWith('\\') ||
    decodedTarget.includes('\\') ||
    /^[a-z]:[\\/]/iu.test(decodedTarget) ||
    /^[a-z][a-z\d+.-]*:/iu.test(decodedTarget)
  ) {
    throw new SkillValidationError(`Absolute resource link "${trimmedTarget}" is not allowed in ${sourcePath}`)
  }

  const fragmentIndex = decodedTarget.indexOf('#')
  const queryIndex = decodedTarget.indexOf('?')
  const cutIndex = [fragmentIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  const pathTarget = cutIndex === undefined ? decodedTarget : decodedTarget.slice(0, cutIndex)
  if (!pathTarget) {
    return null
  }

  const segments = pathTarget.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new SkillValidationError(`Traversal resource link "${trimmedTarget}" is not allowed in ${sourcePath}`)
  }
  const normalized = path.posix.normalize(pathTarget)
  if (normalized === 'SKILL.md') {
    throw new SkillValidationError(`SKILL.md cannot be referenced as a loadable resource in ${sourcePath}`)
  }
  if (normalized === '.' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new SkillValidationError(`Resource link "${trimmedTarget}" escapes its skill directory in ${sourcePath}`)
  }
  return normalized
}

/**
 * @param {ValidatedSkill[]} skills
 * @returns {string}
 */
function generateRegistrySource(skills) {
  const sortedSkills = [...skills].sort((left, right) => compareStrings(left.name, right.name))
  const data = sortedSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    activation: skill.activation,
    body: skill.body,
    resources: Object.fromEntries(
      [...skill.resources]
        .sort((left, right) => compareStrings(left.path, right.path))
        .map((resource) => [resource.path, resource.content]),
    ),
  }))
  const serializedData = JSON.stringify(data, null, 2)
  return `/** Generated by scripts/validate-skills.mjs. Do not edit manually. */
export type GeneratedSkillActivation = 'mandatory' | 'autonomous'

export type GeneratedSkillDefinition = {
  readonly name: string
  readonly description: string
  readonly activation: GeneratedSkillActivation
  readonly body: string
  readonly resources: Readonly<Record<string, string>>
}

export const GENERATED_SKILLS = ${serializedData} as const satisfies readonly GeneratedSkillDefinition[]
`
}

/**
 * @param {string} value
 * @returns {string}
 */
function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripAngleBrackets(value) {
  return value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function comparePaths(left, right) {
  return compareStrings(left, right)
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareStrings(left, right) {
  if (left === right) {
    return 0
  }
  return left < right ? -1 : 1
}

/**
 * @param {string[]} args
 * @returns {ValidationOptions}
 */
function parseCliOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    const next = args[index + 1]
    const rootValue = argument.startsWith('--root=')
      ? argument.slice('--root='.length)
      : argument.startsWith('--skills-root=')
        ? argument.slice('--skills-root='.length)
        : undefined
    const outputValue = argument.startsWith('--output=')
      ? argument.slice('--output='.length)
      : undefined
    if (rootValue !== undefined) {
      if (!rootValue) {
        throw new SkillValidationError(`${argument.split('=')[0]} requires a path`)
      }
      options.skillsRoot = rootValue
    } else if (outputValue !== undefined) {
      if (!outputValue) {
        throw new SkillValidationError('--output requires a path')
      }
      options.outputPath = outputValue
    } else if (argument === '--root' || argument === '--skills-root') {
      if (!next) {
        throw new SkillValidationError(`${argument} requires a path`)
      }
      options.skillsRoot = next
      index += 1
    } else if (argument === '--output') {
      if (!next) {
        throw new SkillValidationError('--output requires a path')
      }
      options.outputPath = next
      index += 1
    } else {
      throw new SkillValidationError(`Unknown argument: ${argument}`)
    }
  }
  return options
}

function isMainModule() {
  const entryPath = process.argv[1]
  return entryPath !== undefined && path.resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  validateSkills(parseCliOptions(process.argv.slice(2)))
    .then((skills) => {
      process.stdout.write(`Validated ${skills.length} skill(s) and generated the runtime registry.\n`)
    })
    .catch((error) => {
      process.stderr.write(`Skill validation failed: ${errorMessage(error)}\n`)
      process.exitCode = 1
    })
}
