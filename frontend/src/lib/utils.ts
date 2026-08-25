import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TABLE_SEP_REGEX = new RegExp("^\\|[\\-\\:\\s\\|]+\\|$", "gm")
const TABLE_PIPE_REGEX = new RegExp("^\\|(.*)\\|$", "gm")
const BOLD_REGEX = new RegExp("(\\*\\*|__)(.*?)\\1", "g")
const ITALIC_REGEX = new RegExp("(\\*|_)(.*?)\\1", "g")
const CODE_BLOCK_REGEX = new RegExp("```[\\s\\S]*?```", "g")
const HEADER_REGEX = new RegExp("^#{1,6}\\s+", "gm")
const INLINE_CODE_REGEX = new RegExp("`([^`]+)`", "g")
const LINK_REGEX = new RegExp("\\[([^\\]]+)\\]\\([^)]+\\)", "g")
const BULLET_REGEX = new RegExp("^[>\\*\\-\\+]\\s+", "gm")
const NUM_LIST_REGEX = new RegExp("^\\d+\\.\\s+", "gm")
const HR_REGEX = new RegExp("^[\\-\\*_]{3,}\\s*$", "gm")
const THINK_BLOCK_REGEX = new RegExp("<think>[\\s\\S]*?<\\/think>", "gi")
const THINK_TAG_REGEX = new RegExp("<\\/?[a-zA-Z0-9_\\-]*think[a-zA-Z0-9_\\-]*>", "gi")

export function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(CODE_BLOCK_REGEX, "")
    .replace(HEADER_REGEX, "")
    .replace(BOLD_REGEX, "$2")
    .replace(ITALIC_REGEX, "$2")
    .replace(TABLE_SEP_REGEX, "")
    .replace(TABLE_PIPE_REGEX, "$1")
    .replace(INLINE_CODE_REGEX, "$1")
    .replace(LINK_REGEX, "$1")
    .replace(BULLET_REGEX, "")
    .replace(NUM_LIST_REGEX, "")
    .replace(HR_REGEX, "")
    .replace(/\|/g, " • ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripThinkTags(text: string): string {
  if (!text) return "";
  return text
    .replace(THINK_BLOCK_REGEX, "")
    .replace(THINK_TAG_REGEX, "")
    .trim();
}
