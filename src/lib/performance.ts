
/**
 * Debounce function to limit how often a function can be called
 * @param func The function to debounce
 * @param wait The time in milliseconds to wait before allowing the function to be called again
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit the rate at which a function can be called
 * @param func The function to throttle
 * @param limit The minimum time between function calls in milliseconds
 * @param options Optional configuration for the throttle behavior
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
  options: { leading?: boolean; trailing?: boolean } = { leading: true, trailing: true }
): (...args: Parameters<T>) => any {
  let lastCall = 0;
  let lastResult: any;
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  const { leading = true, trailing = true } = options;
  
  const invokeFunc = (time: number, args: Parameters<T>) => {
    lastCall = time;
    lastResult = func(...args);
    return lastResult;
  };
  
  const trailingEdge = () => {
    timeout = null;
    if (trailing && lastArgs) {
      return invokeFunc(Date.now(), lastArgs);
    }
    lastArgs = null;
  };
  
  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const remaining = limit - (now - lastCall);
    
    lastArgs = args;
    
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      return invokeFunc(now, args);
    }
    
    if (!timeout && trailing) {
      timeout = setTimeout(trailingEdge, remaining);
    }
    
    if (leading) {
      return lastResult;
    }
  };
}

/**
 * Memoize function to cache expensive function results
 * @param func The function to memoize
 */
export function memoize<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map();
  
  return function memoized(...args: Parameters<T>): ReturnType<T> {
    // Create a cache key from the arguments
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = func(...args);
    cache.set(key, result);
    
    return result;
  };
}

/**
 * Measure execution time of a function (for development/debugging)
 * @param func The function to measure
 * @param name Optional name for logging
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  func: T,
  name = 'Function'
): (...args: Parameters<T>) => ReturnType<T> {
  return function measured(...args: Parameters<T>): ReturnType<T> {
    // Only measure in development
    if (process.env.NODE_ENV === 'production') {
      return func(...args);
    }
    
    const start = performance.now();
    const result = func(...args);
    const end = performance.now();
    
    console.log(`${name} took ${(end - start).toFixed(2)}ms`);
    
    return result;
  };
}
