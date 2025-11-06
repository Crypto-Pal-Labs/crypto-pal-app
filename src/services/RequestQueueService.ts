// src/services/RequestQueueService.ts
// Centralized request queue service for all API calls with rate limiting and throttling

export interface QueuedRequest {
  id: string;
  priority: number; // Higher = more priority
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
}

export interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
  backoffMs: number; // Base backoff delay in milliseconds
}

class RequestQueueService {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private requestHistory: Map<string, number[]> = new Map(); // Track requests per API
  private rateLimitConfigs: Map<string, RateLimitConfig> = new Map();
  private rateLimitStatus: Map<string, { blocked: boolean; unblockAt: number }> = new Map();

  /**
   * Register rate limit configuration for an API
   */
  registerApi(apiName: string, config: RateLimitConfig): void {
    this.rateLimitConfigs.set(apiName, config);
    this.requestHistory.set(apiName, []);
    console.log(`RequestQueueService: Registered API ${apiName} with rate limit: ${config.maxRequests} requests per ${config.windowMs}ms`);
  }

  /**
   * Check if API is rate limited
   */
  private isRateLimited(apiName: string): boolean {
    const status = this.rateLimitStatus.get(apiName);
    if (!status) return false;

    if (status.blocked && Date.now() < status.unblockAt) {
      return true;
    }

    // Unblock if time has passed
    if (status.blocked && Date.now() >= status.unblockAt) {
      this.rateLimitStatus.delete(apiName);
      console.log(`RequestQueueService: API ${apiName} unblocked`);
      return false;
    }

    return false;
  }

  /**
   * Check if request should be throttled
   */
  private shouldThrottle(apiName: string): boolean {
    const config = this.rateLimitConfigs.get(apiName);
    if (!config) return false; // No config = no throttling

    const history = this.requestHistory.get(apiName) || [];
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old requests outside window
    const recentRequests = history.filter(timestamp => timestamp > windowStart);
    this.requestHistory.set(apiName, recentRequests);

    // Check if we've exceeded the limit
    if (recentRequests.length >= config.maxRequests) {
      console.log(`RequestQueueService: API ${apiName} throttled (${recentRequests.length}/${config.maxRequests} requests in window)`);
      return true;
    }

    return false;
  }

  /**
   * Record a request for rate limiting
   */
  private recordRequest(apiName: string): void {
    const history = this.requestHistory.get(apiName) || [];
    history.push(Date.now());
    this.requestHistory.set(apiName, history);
  }

  /**
   * Handle rate limit error
   */
  handleRateLimitError(apiName: string, retryAfter?: number): void {
    const config = this.rateLimitConfigs.get(apiName);
    const backoffMs = retryAfter ? retryAfter * 1000 : (config?.backoffMs || 60000);
    const unblockAt = Date.now() + backoffMs;

    this.rateLimitStatus.set(apiName, { blocked: true, unblockAt });
    console.log(`RequestQueueService: API ${apiName} rate limited, unblocking at ${new Date(unblockAt).toISOString()}`);
  }

  /**
   * Add request to queue
   */
  async enqueue<T>(
    apiName: string,
    execute: () => Promise<T>,
    options: {
      priority?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const { priority = 0, maxRetries = 3 } = options;

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        id: `${apiName}_${Date.now()}_${Math.random()}`,
        priority,
        execute,
        resolve,
        reject,
        retryCount: 0,
        maxRetries,
        createdAt: Date.now()
      };

      // Insert in priority order (higher priority first)
      const insertIndex = this.queue.findIndex(r => r.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIndex, 0, request);
      }

      console.log(`RequestQueueService: Enqueued request for ${apiName} (priority: ${priority}, queue size: ${this.queue.length})`);

      // Start processing if not already processing
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) break;

      // Extract API name from request ID
      const apiName = request.id.split('_')[0];

      // Check if API is rate limited
      if (this.isRateLimited(apiName)) {
        const status = this.rateLimitStatus.get(apiName);
        const waitTime = status ? status.unblockAt - Date.now() : 60000;
        console.log(`RequestQueueService: Waiting ${waitTime}ms for rate limit to clear on ${apiName}`);
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 60000)));
        
        // Re-queue request
        this.queue.unshift(request);
        continue;
      }

      // Check if request should be throttled
      if (this.shouldThrottle(apiName)) {
        const config = this.rateLimitConfigs.get(apiName);
        const waitTime = config ? config.windowMs / config.maxRequests : 1000;
        console.log(`RequestQueueService: Throttling ${apiName} request, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Execute request
      try {
        this.recordRequest(apiName);
        const result = await request.execute();
        request.resolve(result);
        console.log(`RequestQueueService: ✅ Request ${request.id} completed successfully`);
      } catch (error: any) {
        // Check if it's a rate limit error
        if (error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
          this.handleRateLimitError(apiName, error.retryAfter);
          request.retryCount++;

          if (request.retryCount <= request.maxRetries) {
            // Re-queue with exponential backoff
            const backoffDelay = Math.min(1000 * Math.pow(2, request.retryCount), 60000);
            console.log(`RequestQueueService: Re-queuing ${request.id} after rate limit (retry ${request.retryCount}/${request.maxRetries}, delay: ${backoffDelay}ms)`);
            
            setTimeout(() => {
              this.queue.unshift(request);
              if (!this.processing) {
                this.processQueue();
              }
            }, backoffDelay);
            continue;
          } else {
            request.reject(new Error(`Rate limit exceeded after ${request.maxRetries} retries`));
          }
        } else {
          // Non-rate-limit error - retry with exponential backoff
          request.retryCount++;
          
          if (request.retryCount <= request.maxRetries) {
            const backoffDelay = Math.min(1000 * Math.pow(2, request.retryCount), 30000);
            console.log(`RequestQueueService: Retrying ${request.id} after error (retry ${request.retryCount}/${request.maxRetries}, delay: ${backoffDelay}ms)`);
            
            setTimeout(() => {
              this.queue.unshift(request);
              if (!this.processing) {
                this.processQueue();
              }
            }, backoffDelay);
            continue;
          } else {
            request.reject(error);
          }
        }
      }

      // Small delay between requests to avoid overwhelming APIs
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing = false;
    console.log(`RequestQueueService: Queue processing complete`);
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueSize: number;
    processing: boolean;
    rateLimitedApis: string[];
  } {
    const rateLimitedApis = Array.from(this.rateLimitStatus.entries())
      .filter(([_, status]) => status.blocked && Date.now() < status.unblockAt)
      .map(([name, _]) => name);

    return {
      queueSize: this.queue.length,
      processing: this.processing,
      rateLimitedApis
    };
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    console.log('RequestQueueService: Queue cleared');
  }
}

// Export singleton instance
export const requestQueueService = new RequestQueueService();

// Register default rate limit configurations
requestQueueService.registerApi('coingecko', {
  maxRequests: 50, // 50 requests
  windowMs: 60000, // per minute
  backoffMs: 60000 // 1 minute backoff
});

requestQueueService.registerApi('coinpaprika', {
  maxRequests: 100, // 100 requests
  windowMs: 60000, // per minute
  backoffMs: 30000 // 30 seconds backoff
});

requestQueueService.registerApi('cryptocompare', {
  maxRequests: 100, // 100 requests
  windowMs: 60000, // per minute
  backoffMs: 30000 // 30 seconds backoff
});

requestQueueService.registerApi('transak', {
  maxRequests: 100, // 100 requests
  windowMs: 60000, // per minute
  backoffMs: 30000 // 30 seconds backoff
});

requestQueueService.registerApi('covalent', {
  maxRequests: 200, // 200 requests
  windowMs: 60000, // per minute
  backoffMs: 30000 // 30 seconds backoff
});

