import { randomUUID } from "node:crypto";
import type { Job, ReviewResult } from "../assistants/types.js";

const jobs = new Map<string, Job>();

export function createJob(): Job {
  const job: Job = {
    id: randomUUID(),
    status: "pending",
    progress: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function setRunning(id: string): void {
  const job = jobs.get(id);
  if (job) { job.status = "running"; job.progress = 0; }
}

export function setDone(id: string, results: ReviewResult[]): void {
  const job = jobs.get(id);
  if (job) { job.status = "done"; job.progress = 100; job.results = results; }
}

export function setError(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) { job.status = "error"; job.error = error; }
}

export function updateProgress(id: string, progress: number): void {
  const job = jobs.get(id);
  if (job) job.progress = Math.min(99, progress);
}
