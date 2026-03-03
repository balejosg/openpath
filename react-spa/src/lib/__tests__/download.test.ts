import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from '../download';

type UrlWithObjectUrl = typeof URL & {
  createObjectURL?: (obj: Blob | MediaSource) => string;
  revokeObjectURL?: (url: string) => void;
};

describe('downloadFile', () => {
  const url = URL as unknown as UrlWithObjectUrl;
  const originalCreateObjectURL = url.createObjectURL;
  const originalRevokeObjectURL = url.revokeObjectURL;

  let createObjectUrlMock: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>> | null =
    null;
  let revokeObjectUrlMock: ReturnType<typeof vi.fn<(url: string) => void>> | null = null;

  beforeEach(() => {
    createObjectUrlMock = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:mock');
    revokeObjectUrlMock = vi.fn<(url: string) => void>();

    url.createObjectURL = createObjectUrlMock;
    url.revokeObjectURL = revokeObjectUrlMock;

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    url.createObjectURL = originalCreateObjectURL;
    url.revokeObjectURL = originalRevokeObjectURL;

    vi.restoreAllMocks();
  });

  it('creates a hidden anchor, clicks it, and revokes the object URL', () => {
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    const capture: {
      appended: HTMLAnchorElement | null;
      removed: HTMLAnchorElement | null;
    } = {
      appended: null,
      removed: null,
    };

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) capture.appended = node;
      return originalAppendChild(node);
    });

    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) capture.removed = node;
      return originalRemoveChild(node);
    });

    downloadFile('hello', 'test.txt', 'text/plain');

    if (!createObjectUrlMock || !revokeObjectUrlMock) {
      throw new Error('Expected URL mocks to be initialized');
    }

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);

    const appendedAnchor = capture.appended;
    const removedAnchor = capture.removed;

    if (!appendedAnchor) {
      throw new Error('Expected an HTMLAnchorElement to be appended');
    }

    expect(appendedAnchor.download).toBe('test.txt');
    expect(appendedAnchor.style.display).toBe('none');
    expect(appendedAnchor.href).toContain('blob:mock');

    expect(removedAnchor).toBe(appendedAnchor);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:mock');
  });
});
