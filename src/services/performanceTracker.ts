export interface PerformanceMetrics {
  reqStart: number;
  ttft: number | null; // Time To First Token in ms
  totalTime: number | null; // Total generation time in ms
  charCount: number;
  charsPerSec: number | null;
  model: string;
}

class PerformanceTracker {
  private activeMetrics: PerformanceMetrics | null = null;
  private lastCompletedMetrics: PerformanceMetrics | null = null;

  startRequest(model: string): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      reqStart: performance.now(),
      ttft: null,
      totalTime: null,
      charCount: 0,
      charsPerSec: null,
      model,
    };
    this.activeMetrics = metrics;
    return metrics;
  }

  recordFirstToken(): number | null {
    if (!this.activeMetrics || this.activeMetrics.ttft !== null) return null;
    const ttft = performance.now() - this.activeMetrics.reqStart;
    this.activeMetrics.ttft = Math.round(ttft);
    console.log(`[KEO Speed Metrics] TTFT (Time To First Token): ${this.activeMetrics.ttft}ms [Model: ${this.activeMetrics.model}]`);
    return this.activeMetrics.ttft;
  }

  recordProgress(textLength: number): void {
    if (this.activeMetrics) {
      this.activeMetrics.charCount = textLength;
    }
  }

  finishRequest(): PerformanceMetrics | null {
    if (!this.activeMetrics) return null;
    const totalTime = performance.now() - this.activeMetrics.reqStart;
    this.activeMetrics.totalTime = Math.round(totalTime);
    if (totalTime > 0 && this.activeMetrics.charCount > 0) {
      this.activeMetrics.charsPerSec = Math.round((this.activeMetrics.charCount / totalTime) * 1000);
    }
    console.log(
      `[KEO Speed Metrics] Complete | TTFT: ${this.activeMetrics.ttft ?? 0}ms | Total: ${this.activeMetrics.totalTime}ms | Chars: ${this.activeMetrics.charCount} | Speed: ${this.activeMetrics.charsPerSec ?? 0} chars/sec [Model: ${this.activeMetrics.model}]`
    );
    this.lastCompletedMetrics = { ...this.activeMetrics };
    this.activeMetrics = null;
    return this.lastCompletedMetrics;
  }

  getLastMetrics(): PerformanceMetrics | null {
    return this.lastCompletedMetrics;
  }
}

export const perfTracker = new PerformanceTracker();
