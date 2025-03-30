/**
 * Enhanced logging utility for the Telegram bot
 */
class Logger {
    constructor(options = {}) {
      this.debugMode = options.debugMode || process.env.DEBUG_MODE === 'true';
      this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
      
      // Log levels hierarchy
      this.levels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4
      };
    }
  
    /**
     * Check if the given log level should be logged
     * @param {string} level - Log level to check
     * @returns {boolean} - Whether to log this level
     */
    shouldLog(level) {
      return this.levels[level] <= this.levels[this.logLevel];
    }
  
    /**
     * Format a log message with timestamp and module info
     * @param {string} level - Log level
     * @param {string} module - Module name
     * @param {string} message - Log message
     * @param {Object} data - Additional data to log
     * @returns {string} - Formatted log message
     */
    formatLog(level, module, message, data) {
      const timestamp = new Date().toISOString();
      let logMessage = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
      
      if (data && Object.keys(data).length > 0) {
        try {
          // Format data for better readability
          const dataString = JSON.stringify(data, (key, value) => {
            // Handle circular references and functions
            if (typeof value === 'function') return '[Function]';
            if (typeof value === 'object' && value !== null) {
              if (key === 'parent' || key === '_events' || key === '_eventsCount') return '[Circular]';
            }
            return value;
          }, 2);
          
          logMessage += `\nData: ${dataString}`;
        } catch (err) {
          logMessage += `\nData: [Could not stringify: ${err.message}]`;
        }
      }
      
      return logMessage;
    }
  
    /**
     * Log an error message
     * @param {string} module - Module name
     * @param {string} message - Log message
     * @param {Error|Object} [error] - Error object or additional data
     */
    error(module, message, error) {
      if (!this.shouldLog('error')) return;
      
      let errorData = {};
      if (error instanceof Error) {
        errorData = {
          message: error.message,
          stack: error.stack,
          name: error.name
        };
      } else if (error) {
        errorData = error;
      }
      
      console.error(this.formatLog('error', module, message, errorData));
    }
  
    /**
     * Log a warning message
     * @param {string} module - Module name
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    warn(module, message, data) {
      if (!this.shouldLog('warn')) return;
      console.warn(this.formatLog('warn', module, message, data));
    }
  
    /**
     * Log an info message
     * @param {string} module - Module name
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    info(module, message, data) {
      if (!this.shouldLog('info')) return;
      console.info(this.formatLog('info', module, message, data));
    }
  
    /**
     * Log a debug message
     * @param {string} module - Module name
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    debug(module, message, data) {
      if (!this.shouldLog('debug')) return;
      console.debug(this.formatLog('debug', module, message, data));
    }
  
    /**
     * Log a trace message (most detailed level)
     * @param {string} module - Module name
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    trace(module, message, data) {
      if (!this.shouldLog('trace')) return;
      console.debug(this.formatLog('trace', module, message, data));
    }
  }
  
  module.exports = new Logger();