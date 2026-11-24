import { z } from "zod";
import type { components } from "./generated-api";
export const challengeSchema = z.object({
  id: z.string(),
  name: z.string(),
  topic: z.string(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  description: z.string(),
  code: z.string(),
  family: z.string(),
}) satisfies z.ZodType<Challenge>;
export type Challenge = components["schemas"]["Challenge"];
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_by: z.string(),
  created_at: z.string(),
}) satisfies z.ZodType<Workspace>;
export type Workspace = components["schemas"]["Workspace"];
export const sessionSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  owner_id: z.string(),
  challenge_id: z.string(),
  mode: z.enum(["practice", "assessment"]),
  assistance: z.boolean(),
  code: z.string(),
  diagnosis: z.string(),
  revision: z.number(),
  hints: z.array(z.string()),
  status: z.enum(["active", "submitted"]),
  deadline: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Session>;
export type Session = components["schemas"]["Session"];
export const runSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  owner_id: z.string(),
  session_id: z.string().nullable(),
  operation: z.string(),
  revision: z.number(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
}) satisfies z.ZodType<Run>;
export type Run = components["schemas"]["Run"];
export const projectSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  created_at: z.string(),
}) satisfies z.ZodType<Project>;
export type Project = components["schemas"]["Project"];
export const fileSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  path: z.string(),
  source: z.string(),
  revision: z.number(),
  updated_at: z.string(),
}) satisfies z.ZodType<ProjectFile>;
export type ProjectFile = components["schemas"]["ProjectFile"];
export const findingSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  line: z.number().nullable(),
  message: z.string(),
}) satisfies z.ZodType<Finding>;
export type Finding = components["schemas"]["Finding"];
export const scoreSchema = z.object({
  passed: z.number().optional(),
  total: z.number(),
  visible: z.array(
    z.object({
      passed: z.boolean(),
      error: z.string(),
      input: z.string().optional(),
      expected: z.unknown(),
      actual: z.unknown(),
      stdout: z.string().optional(),
    }),
  ),
  hidden_passed: z.number().nullable().optional(),
  source_hash: z.string(),
  rating: z.number().optional(),
});
export const analysisSchema = z.object({
  summary: z.string(),
  explanation: z.string(),
  findings: z.array(findingSchema),
  suggested_code: z.string().nullable(),
});
export type RunReport = components["schemas"]["RunReport"];
export const reportSchema = runSchema.extend({
  source: z.string(),
  challenge_id: z.string(),
  diagnosis: z.string(),
  hints_used: z.number(),
  reflection: z.object({run_id:z.string(), owner_id:z.string(), confidence:z.number(), explanation:z.string(),created_at:z.string(),
    code_score:z.number(),diagnosis_score:z.number().nullable(),explanation_score:z.number().nullable(),feedback:z.string().nullable(),
    evaluation_status:z.enum(["queued","running","completed","failed"]),version:z.number(),}).nullable(),
}) satisfies z.ZodType<RunReport>;


export type ChatTurn = components["schemas"]["ChatTurn"];
export const chatTurnSchema = z.object({
  id: z.string(), thread_id: z.string(), file_id: z.string(), revision: z.number(), prompt: z.string(), auto_apply: z.boolean(),
  status: z.enum(["queued","running","completed","failed","cancelled"]), response: z.unknown().nullable(), error: z.string().nullable(),
  applied_revision: z.number().nullable(), reverted_revision: z.number().nullable(), created_at: z.string(), completed_at: z.string().nullable(),
}) satisfies z.ZodType<ChatTurn>;
export const agentReplySchema = z.object({
  message: z.string(), edits: z.array(z.object({search:z.string(),replacement:z.string(),reason:z.string()})),
  validated:z.boolean(), validation:z.string(), context_truncated:z.boolean(),
});
export const reflectionSchema = z.object({
  run_id:z.string(), owner_id:z.string(), explanation:z.string(), created_at:z.string(), confidence:z.number(), code_score:z.number(),
  diagnosis_score:z.number().nullable(), explanation_score:z.number().nullable(), feedback:z.string().nullable(),
  evaluation_status:z.enum(["queued","running","completed","failed"]), version:z.number(),
}) satisfies z.ZodType<components["schemas"]["SavedReflection"]>;
