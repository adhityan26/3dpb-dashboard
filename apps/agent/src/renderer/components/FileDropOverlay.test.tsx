import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FileDropOverlay } from "./FileDropOverlay";

const mockUploadFile = vi.fn();
const mockGetPathForFile = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPathForFile.mockImplementation((file: File) => `/fake/dropped/${file.name}`);
  Object.assign(window, { agentApi: { uploadFile: mockUploadFile, getPathForFile: mockGetPathForFile } });
});

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("FileDropOverlay", () => {
  it("block file lebih dari 4GB tanpa memanggil uploadFile", () => {
    const onUploaded = vi.fn();
    const { container } = render(<FileDropOverlay shortCode="ABC123" deviceLabel="Bambu X1C" onUploaded={onUploaded} />);
    const dropTarget = container.firstChild as Element;

    const bigFile = makeFile("huge.gcode", 5 * 1024 * 1024 * 1024);
    fireEvent.drop(dropTarget, { dataTransfer: { files: [bigFile] } });

    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("upload file valid lalu panggil onUploaded dengan remote path", async () => {
    mockUploadFile.mockResolvedValue(undefined);
    const onUploaded = vi.fn();
    const { container } = render(<FileDropOverlay shortCode="ABC123" deviceLabel="Bambu X1C" onUploaded={onUploaded} />);
    const dropTarget = container.firstChild as Element;

    const validFile = makeFile("model.gcode.3mf", 2 * 1024 * 1024);
    fireEvent.drop(dropTarget, { dataTransfer: { files: [validFile] } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockUploadFile).toHaveBeenCalledWith("ABC123", expect.any(String), "/model.gcode.3mf");
    expect(onUploaded).toHaveBeenCalledWith("/model.gcode.3mf");
  });
});
