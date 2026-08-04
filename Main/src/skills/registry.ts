import { GENERATED_SKILLS } from './generated-skill-registry.js'
import type { GeneratedSkillDefinition } from './generated-skill-registry.js'

export type SkillActivation = 'mandatory' | 'autonomous'

export type SkillMetadata = {
  name: string;
  description: string;
  activation: SkillActivation;
  resources: readonly string[];
}

export type SkillResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string }

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

const SKILL_BY_NAME = new Map<string, GeneratedSkillDefinition>(
  GENERATED_SKILLS.map((skill) => [skill.name, skill]),
)

export function listSkillMetadata(): SkillMetadata[] {
  return GENERATED_SKILLS.map((skill) => ({
    name: skill.name,
    description: skill.description,
    activation: skill.activation,
    resources: Object.freeze(Object.keys(skill.resources).sort()),
  }))
}

export function loadSkillBody(name: string): SkillResult<string> {
  const skill = SKILL_BY_NAME.get(name)
  if (!skill) {
    return {
      success: false,
      code: 'SKILL_NOT_FOUND',
      error: `Skill "${name}" was not found in the bundled registry`,
    }
  }
  return { success: true, data: skill.body }
}

export function readSkillResource(name: string, relativePath: string): SkillResult<string> {
  const skill = SKILL_BY_NAME.get(name)
  if (!skill) {
    return {
      success: false,
      code: 'SKILL_NOT_FOUND',
      error: `Skill "${name}" was not found in the bundled registry`,
    }
  }

  const normalizedPath = normalizeResourcePath(relativePath)
  if (normalizedPath.success === false) {
    return normalizedPath
  }
  const extension = getFileExtension(normalizedPath.data)
  if (!SUPPORTED_RESOURCE_EXTENSIONS.has(extension)) {
    return {
      success: false,
      code: 'UNSUPPORTED_RESOURCE_TYPE',
      error: `Resource "${normalizedPath.data}" is not a supported text resource`,
    }
  }

  const resource = skill.resources[normalizedPath.data]
  if (typeof resource !== 'string') {
    return {
      success: false,
      code: 'RESOURCE_NOT_FOUND',
      error: `Resource "${normalizedPath.data}" was not found in skill "${name}"`,
    }
  }
  return { success: true, data: resource }
}

export function getMandatorySkillBodies(): string[] {
  return GENERATED_SKILLS
    .filter((skill) => skill.activation === 'mandatory')
    .map((skill) => skill.body)
}

function normalizeResourcePath(relativePath: string): SkillResult<string> {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\u0000')) {
    return {
      success: false,
      code: 'INVALID_RESOURCE_PATH',
      error: 'Resource path must be a non-empty relative text path',
    }
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(relativePath)
  } catch {
    return {
      success: false,
      code: 'INVALID_RESOURCE_PATH',
      error: 'Resource path contains invalid percent encoding',
    }
  }

  if (
    decodedPath.startsWith('/') ||
    decodedPath.startsWith('\\') ||
    /^[a-z]:/iu.test(decodedPath) ||
    /^[a-z][a-z\d+.-]*:/iu.test(decodedPath) ||
    decodedPath.includes('\\')
  ) {
    return {
      success: false,
      code: 'INVALID_RESOURCE_PATH',
      error: 'Resource path must stay inside its skill directory',
    }
  }

  const segments = decodedPath.split('/')
  if (segments.some((segment) => segment === '..')) {
    return {
      success: false,
      code: 'RESOURCE_PATH_TRAVERSAL',
      error: 'Resource path traversal is not allowed',
    }
  }

  const normalizedPath = segments.filter((segment) => segment !== '' && segment !== '.').join('/')
  if (!normalizedPath) {
    return {
      success: false,
      code: 'INVALID_RESOURCE_PATH',
      error: 'Resource path must name a bundled text resource',
    }
  }
  if (normalizedPath === 'SKILL.md') {
    return {
      success: false,
      code: 'SKILL_FILE_NOT_READABLE',
      error: 'SKILL.md must be loaded with load_skill, not read_skill_file',
    }
  }
  return { success: true, data: normalizedPath }
}

function getFileExtension(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf('/')
  const fileName = separatorIndex >= 0 ? filePath.slice(separatorIndex + 1) : filePath
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : ''
}
