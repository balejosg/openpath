/**
 * OpenPath SPA - Safe DOM Helpers
 * Provides type-safe access to DOM elements with proper error handling
 */

/**
 * Safely get element by ID with type assertion
 * Returns null if element doesn't exist
 */
export function getElement<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

/**
 * Get element by ID or throw with helpful error
 * Use this when you are CERTAIN the element exists in the HTML
 */
export function requireElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`Required element #${id} not found in DOM`);
    }
    return el as T;
}

/**
 * Safely query selector with type assertion
 */
export function querySelector<T extends Element>(
    selector: string,
    parent: ParentNode = document
): T | null {
    return parent.querySelector<T>(selector);
}

/**
 * Query selector or throw
 */
export function requireSelector<T extends Element>(
    selector: string,
    parent: ParentNode = document
): T {
    const el = parent.querySelector(selector);
    if (!el) {
        throw new Error(`Required selector "${selector}" not found in DOM`);
    }
    return el as T;
}
