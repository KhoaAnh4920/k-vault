/** One-line JSON logs for grep/parsing; keep keys stable (videoId, jobId, queueName, stage, codec). */
/** Writes to stderr so stdout can be a single-line TTY progress bar without line breaks. */
export function logStructured(event: Record<string, unknown>): void {
  process.stderr.write(
    JSON.stringify({ ...event, ts: new Date().toISOString() }) + "\n",
  );
}
