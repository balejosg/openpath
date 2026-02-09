/**
 * Utility functions for reading files dropped/uploaded by users.
 */

/** Allowed file extensions for import */
export const ALLOWED_EXTENSIONS = ['.txt', '.csv', '.list'] as const;

/** Allowed MIME types for import */
export const ALLOWED_MIME_TYPES = ['text/plain', 'text/csv', 'application/csv'] as const;

/**
 * Check if a file is a valid text file for import.
 */
export function isValidTextFile(file: File): boolean {
  // Check by MIME type
  if (ALLOWED_MIME_TYPES.some((type) => file.type === type)) {
    return true;
  }
  // Check by extension (fallback for files without proper MIME)
  return ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

/**
 * Read a single file's text content.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        resolve(content);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Filter and read multiple files, returning combined content.
 * Only reads valid text files (.txt, .csv, .list).
 *
 * @returns Object with combined content and list of skipped files
 */
export async function readMultipleFiles(files: FileList | File[]): Promise<{
  content: string;
  validFiles: string[];
  skippedFiles: string[];
}> {
  const fileArray = Array.from(files);
  const validFiles: File[] = [];
  const skippedFiles: string[] = [];

  for (const file of fileArray) {
    if (isValidTextFile(file)) {
      validFiles.push(file);
    } else {
      skippedFiles.push(file.name);
    }
  }

  if (validFiles.length === 0) {
    return { content: '', validFiles: [], skippedFiles: skippedFiles };
  }

  const contents = await Promise.all(validFiles.map(readFileAsText));
  const combinedContent = contents.join('\n');

  return {
    content: combinedContent,
    validFiles: validFiles.map((f) => f.name),
    skippedFiles,
  };
}
