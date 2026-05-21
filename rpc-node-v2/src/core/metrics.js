class Metrics {
  constructor() {
    this.txExecutionMs = [];
    this.sqliteWriteMs = [];
    this.syncFlushMs = [];
    this.syncLatencyMs = [];
    this.quotaErrors = 0;
  }

  observeTxExecution(ms) { this.txExecutionMs.push(ms); }
  observeSqliteWrite(ms) { this.sqliteWriteMs.push(ms); }
  observeSyncFlush(ms) { this.syncFlushMs.push(ms); }
  observeSyncLatency(ms) { this.syncLatencyMs.push(ms); }
  incQuotaErrors() { this.quotaErrors += 1; }

  _avg(values) {
    if (!values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  snapshot() {
    return {
      txExecutionAvgMs: Number(this._avg(this.txExecutionMs).toFixed(2)),
      sqliteWriteAvgMs: Number(this._avg(this.sqliteWriteMs).toFixed(2)),
      syncFlushAvgMs: Number(this._avg(this.syncFlushMs).toFixed(2)),
      syncLatencyAvgMs: Number(this._avg(this.syncLatencyMs).toFixed(2)),
      quotaErrors: this.quotaErrors
    };
  }
}

module.exports = { Metrics };
