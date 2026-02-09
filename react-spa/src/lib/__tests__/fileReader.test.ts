import { describe, it, expect } from 'vitest';
import {
  isValidTextFile,
  readFileAsText,
  readMultipleFiles,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from '../fileReader';

// Helper to create mock File objects
function createMockFile(name: string, content: string, type = 'text/plain'): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

describe('fileReader', () => {
  describe('isValidTextFile', () => {
    it('should accept .txt files', () => {
      const file = createMockFile('domains.txt', 'google.com');
      expect(isValidTextFile(file)).toBe(true);
    });

    it('should accept .csv files', () => {
      const file = createMockFile('domains.csv', 'google.com', 'text/csv');
      expect(isValidTextFile(file)).toBe(true);
    });

    it('should accept .list files', () => {
      const file = createMockFile('blocklist.list', 'facebook.com');
      expect(isValidTextFile(file)).toBe(true);
    });

    it('should accept files with text/plain MIME type', () => {
      const file = createMockFile('data', 'content', 'text/plain');
      expect(isValidTextFile(file)).toBe(true);
    });

    it('should accept files with application/csv MIME type', () => {
      const file = createMockFile('data.csv', 'content', 'application/csv');
      expect(isValidTextFile(file)).toBe(true);
    });

    it('should reject image files', () => {
      const file = createMockFile('image.png', '', 'image/png');
      expect(isValidTextFile(file)).toBe(false);
    });

    it('should reject PDF files', () => {
      const file = createMockFile('document.pdf', '', 'application/pdf');
      expect(isValidTextFile(file)).toBe(false);
    });

    it('should reject executable files', () => {
      const file = createMockFile('program.exe', '', 'application/octet-stream');
      expect(isValidTextFile(file)).toBe(false);
    });

    it('should accept .txt even without proper MIME type', () => {
      const file = createMockFile('domains.txt', 'content', '');
      expect(isValidTextFile(file)).toBe(true);
    });

    it('should be case-insensitive for extensions', () => {
      const file = createMockFile('DOMAINS.TXT', 'content', '');
      expect(isValidTextFile(file)).toBe(true);
    });
  });

  describe('readFileAsText', () => {
    it('should read file content as string', async () => {
      const content = 'google.com\nyoutube.com\nfacebook.com';
      const file = createMockFile('domains.txt', content);

      const result = await readFileAsText(file);
      expect(result).toBe(content);
    });

    it('should handle empty files', async () => {
      const file = createMockFile('empty.txt', '');
      const result = await readFileAsText(file);
      expect(result).toBe('');
    });

    it('should handle unicode content', async () => {
      const content = 'dominio.com\nサイト.jp\nпример.рф';
      const file = createMockFile('unicode.txt', content);

      const result = await readFileAsText(file);
      expect(result).toBe(content);
    });

    it('should handle large files', async () => {
      const lines = Array.from({ length: 1000 }, (_, i) => `domain${String(i)}.com`);
      const content = lines.join('\n');
      const file = createMockFile('large.txt', content);

      const result = await readFileAsText(file);
      expect(result).toBe(content);
    });
  });

  describe('readMultipleFiles', () => {
    it('should read single valid file', async () => {
      const file = createMockFile('domains.txt', 'google.com');
      const files = [file];

      const result = await readMultipleFiles(files);

      expect(result.content).toBe('google.com');
      expect(result.validFiles).toEqual(['domains.txt']);
      expect(result.skippedFiles).toEqual([]);
    });

    it('should combine multiple files with newlines', async () => {
      const file1 = createMockFile('list1.txt', 'google.com\nyoutube.com');
      const file2 = createMockFile('list2.txt', 'facebook.com');
      const files = [file1, file2];

      const result = await readMultipleFiles(files);

      expect(result.content).toBe('google.com\nyoutube.com\nfacebook.com');
      expect(result.validFiles).toEqual(['list1.txt', 'list2.txt']);
      expect(result.skippedFiles).toEqual([]);
    });

    it('should skip invalid files and report them', async () => {
      const validFile = createMockFile('domains.txt', 'google.com');
      const invalidFile = createMockFile('image.png', '', 'image/png');
      const files = [validFile, invalidFile];

      const result = await readMultipleFiles(files);

      expect(result.content).toBe('google.com');
      expect(result.validFiles).toEqual(['domains.txt']);
      expect(result.skippedFiles).toEqual(['image.png']);
    });

    it('should return empty content when all files are invalid', async () => {
      const file1 = createMockFile('image.png', '', 'image/png');
      const file2 = createMockFile('doc.pdf', '', 'application/pdf');
      const files = [file1, file2];

      const result = await readMultipleFiles(files);

      expect(result.content).toBe('');
      expect(result.validFiles).toEqual([]);
      expect(result.skippedFiles).toEqual(['image.png', 'doc.pdf']);
    });

    it('should handle empty file list', async () => {
      const result = await readMultipleFiles([]);

      expect(result.content).toBe('');
      expect(result.validFiles).toEqual([]);
      expect(result.skippedFiles).toEqual([]);
    });

    it('should handle FileList-like objects', async () => {
      const file = createMockFile('domains.txt', 'test.com');
      // Simulate FileList (array-like object)
      const fileList = {
        0: file,
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
        [Symbol.iterator]: function* () {
          yield file;
        },
      } as unknown as FileList;

      const result = await readMultipleFiles(fileList);

      expect(result.content).toBe('test.com');
      expect(result.validFiles).toEqual(['domains.txt']);
    });

    it('should handle mixed valid and invalid files', async () => {
      const txt = createMockFile('list.txt', 'a.com');
      const csv = createMockFile('data.csv', 'b.com', 'text/csv');
      const list = createMockFile('blocked.list', 'c.com');
      const png = createMockFile('icon.png', '', 'image/png');
      const exe = createMockFile('app.exe', '', 'application/octet-stream');
      const files = [txt, csv, list, png, exe];

      const result = await readMultipleFiles(files);

      expect(result.content).toBe('a.com\nb.com\nc.com');
      expect(result.validFiles).toHaveLength(3);
      expect(result.skippedFiles).toEqual(['icon.png', 'app.exe']);
    });
  });

  describe('constants', () => {
    it('should export allowed extensions', () => {
      expect(ALLOWED_EXTENSIONS).toContain('.txt');
      expect(ALLOWED_EXTENSIONS).toContain('.csv');
      expect(ALLOWED_EXTENSIONS).toContain('.list');
    });

    it('should export allowed MIME types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('text/plain');
      expect(ALLOWED_MIME_TYPES).toContain('text/csv');
    });
  });
});
