import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { StringArtEngine, generateSVG, generatePDF } from "./string-art-engine";
import { generationParamsSchema } from "@shared/schema";
import { z } from "zod";

// Store active generation jobs
const activeJobs = new Map<string, StringArtEngine>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Generate string art
  app.post("/api/generate", async (req, res) => {
    try {
      const { imageDataUrl, params } = req.body;

      if (!imageDataUrl || typeof imageDataUrl !== "string") {
        return res.status(400).json({ error: "Missing image data" });
      }

      // Validate params
      const validatedParams = generationParamsSchema.parse(params || {});

      // Create job
      const job = await storage.createJob(imageDataUrl, validatedParams);

      // Start generation in background
      const engine = new StringArtEngine(validatedParams);
      activeJobs.set(job.id, engine);

      // Run generation asynchronously
      (async () => {
        try {
          await storage.updateJobProgress(job.id, {
            status: "preprocessing",
            stage: "Starting generation...",
            percentage: 0,
          });

          const result = await engine.generate(
            imageDataUrl,
            async (currentThread, totalThreads, stage, previewData, accuracy) => {
              const percentage = Math.round((currentThread / totalThreads) * 100);
              
              // Determine status based on stage text
              let status: "preprocessing" | "generating" | "optimizing" | "complete" = "generating";
              if (stage.toLowerCase().includes("preprocess") || stage.toLowerCase().includes("detecting") || stage.toLowerCase().includes("loading")) {
                status = "preprocessing";
              } else if (stage.toLowerCase().includes("annealing") || stage.toLowerCase().includes("genetic") || stage.toLowerCase().includes("cleaning") || stage.toLowerCase().includes("refin")) {
                status = "optimizing";
              }
              
              await storage.updateJobProgress(
                job.id,
                {
                  status,
                  stage,
                  currentThread,
                  totalThreads,
                  percentage,
                  estimatedTimeRemaining: Math.round(
                    ((totalThreads - currentThread) / Math.max(currentThread, 1)) * 2
                  ),
                  accuracy: accuracy,
                },
                previewData
              );
            }
          );

          await storage.completeJob(job.id, result);
        } catch (error) {
          console.error("Generation error:", error);
          await storage.failJob(job.id, "Generation failed");
        } finally {
          activeJobs.delete(job.id);
        }
      })();

      res.json({ jobId: job.id, status: "pending" });
    } catch (error) {
      console.error("Generate error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid parameters", details: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get generation progress
  app.get("/api/progress/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        progress: job.progress,
        previewDataUrl: job.previewDataUrl,
      });
    } catch (error) {
      console.error("Progress error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get generation result
  app.get("/api/result/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const result = await storage.getResult(jobId);

      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }

      res.json({ result });
    } catch (error) {
      console.error("Result error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel generation
  app.post("/api/cancel/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const engine = activeJobs.get(jobId);

      if (engine) {
        engine.cancel();
        activeJobs.delete(jobId);
      }

      await storage.failJob(jobId, "Cancelled by user");
      res.json({ success: true });
    } catch (error) {
      console.error("Cancel error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Export SVG
  app.get("/api/export/:jobId/svg", async (req, res) => {
    try {
      const { jobId } = req.params;
      const result = await storage.getResult(jobId);

      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }

      const svg = generateSVG(result);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Content-Disposition", `attachment; filename="string-art-${jobId}.svg"`);
      res.send(svg);
    } catch (error) {
      console.error("SVG export error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Export PDF
  app.get("/api/export/:jobId/pdf", async (req, res) => {
    try {
      const { jobId } = req.params;
      const result = await storage.getResult(jobId);

      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }

      const pdf = generatePDF(result);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="string-art-${jobId}.pdf"`);
      res.send(pdf);
    } catch (error) {
      console.error("PDF export error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Continue generation - add more threads to existing result
  app.post("/api/continue/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const { additionalThreads = 1000 } = req.body;
      
      const existingResult = await storage.getResult(jobId);
      if (!existingResult) {
        return res.status(404).json({ error: "Result not found" });
      }

      // Get the original image data from the job
      const originalImage = await storage.getOriginalImage(jobId);
      if (!originalImage) {
        return res.status(404).json({ error: "Original image not found" });
      }

      // Create new job with increased thread count
      const newParams = {
        ...existingResult.params,
        maxThreads: existingResult.totalThreads + additionalThreads,
      };
      
      const job = await storage.createJob(originalImage, newParams);

      // Start continuation generation
      const engine = new StringArtEngine(newParams);
      activeJobs.set(job.id, engine);

      (async () => {
        try {
          await storage.updateJobProgress(job.id, {
            status: "generating",
            stage: "Continuing generation...",
            percentage: 0,
          });

          // Continue from existing connections
          const result = await engine.continueGeneration(
            existingResult,
            additionalThreads,
            async (currentThread, totalThreads, stage, previewData, accuracy) => {
              const percentage = Math.round((currentThread / totalThreads) * 100);
              await storage.updateJobProgress(
                job.id,
                {
                  status: "generating",
                  stage,
                  currentThread,
                  totalThreads,
                  percentage,
                  estimatedTimeRemaining: Math.round(
                    ((totalThreads - currentThread) / Math.max(currentThread, 1)) * 2
                  ),
                  accuracy,
                },
                previewData
              );
            }
          );

          await storage.completeJob(job.id, result);
        } catch (error) {
          console.error("Continue generation error:", error);
          await storage.failJob(job.id, "Continue generation failed");
        } finally {
          activeJobs.delete(job.id);
        }
      })();

      res.json({ jobId: job.id, status: "pending" });
    } catch (error) {
      console.error("Continue error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get preview at specific thread count (renders subset of connections)
  app.get("/api/preview/:jobId/:threadCount", async (req, res) => {
    try {
      const { jobId, threadCount } = req.params;
      const count = parseInt(threadCount, 10);
      
      const result = await storage.getResult(jobId);
      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }

      // Generate SVG with only first N connections
      const limitedConnections = result.connections.slice(0, count);
      const limitedResult = {
        ...result,
        connections: limitedConnections,
        totalThreads: limitedConnections.length,
      };
      
      const svg = generateSVG(limitedResult);
      res.setHeader("Content-Type", "image/svg+xml");
      res.send(svg);
    } catch (error) {
      console.error("Preview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
