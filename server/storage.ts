import { type GenerationParams, type StringArtResult, type GenerationProgress } from "@shared/schema";
import { randomUUID } from "crypto";

// Job state storage
interface Job {
  id: string;
  status: "pending" | "processing" | "complete" | "error";
  imageDataUrl: string;
  params: GenerationParams;
  progress: GenerationProgress;
  result?: StringArtResult;
  previewDataUrl?: string;
}

export interface IStorage {
  createJob(imageDataUrl: string, params: GenerationParams): Promise<Job>;
  getJob(id: string): Promise<Job | undefined>;
  updateJobProgress(id: string, progress: Partial<GenerationProgress>, previewDataUrl?: string): Promise<void>;
  completeJob(id: string, result: StringArtResult): Promise<void>;
  failJob(id: string, error: string): Promise<void>;
  getResult(id: string): Promise<StringArtResult | undefined>;
  getOriginalImage(id: string): Promise<string | undefined>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job>;

  constructor() {
    this.jobs = new Map();
  }

  async createJob(imageDataUrl: string, params: GenerationParams): Promise<Job> {
    const id = randomUUID();
    const job: Job = {
      id,
      status: "pending",
      imageDataUrl,
      params,
      progress: {
        status: "idle",
        stage: "Initializing...",
        currentThread: 0,
        totalThreads: params.maxThreads,
        percentage: 0,
        estimatedTimeRemaining: 0,
      },
    };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async updateJobProgress(id: string, progress: Partial<GenerationProgress>, previewDataUrl?: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = { ...job.progress, ...progress };
      job.status = "processing";
      if (previewDataUrl) {
        job.previewDataUrl = previewDataUrl;
      }
      this.jobs.set(id, job);
    }
  }

  async completeJob(id: string, result: StringArtResult): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.status = "complete";
      job.result = result;
      job.progress = {
        ...job.progress,
        status: "complete",
        percentage: 100,
        currentThread: result.totalThreads,
        estimatedTimeRemaining: 0,
      };
      this.jobs.set(id, job);
    }
  }

  async failJob(id: string, error: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.status = "error";
      job.progress = {
        ...job.progress,
        status: "error",
        stage: error,
      };
      this.jobs.set(id, job);
    }
  }

  async getResult(id: string): Promise<StringArtResult | undefined> {
    const job = this.jobs.get(id);
    return job?.result;
  }

  async getOriginalImage(id: string): Promise<string | undefined> {
    const job = this.jobs.get(id);
    return job?.imageDataUrl;
  }
}

export const storage = new MemStorage();
