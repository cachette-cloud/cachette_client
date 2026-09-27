'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  apiInitiateUpload,
  apiUploadSingle,
  apiUploadPart,
  apiCompleteUpload,
} from '@/lib/api';
import { RiUploadCloud2Line, RiLoader4Line } from 'react-icons/ri';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB (S3 standard part size)
const CONCURRENT_CHUNKS = 4; // 4 parallel streams over tunnel

interface UploadButtonProps {
  currentFolderId: string | null;
  onUploadComplete: () => void;
}

async function runConcurrentTasks<T, R>(
  items: T[],
  concurrency: number,
  taskFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await taskFn(items[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export default function UploadButton({ currentFolderId, onUploadComplete }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const prefix = files.length > 1 ? `${i + 1}/${files.length} ` : '';
      setUploadProgress(`${prefix}0%`);

      try {
        // Step 1: Initiate upload — creates DB row, returns file_id + upload_mode
        const initRes = await apiInitiateUpload(
          file.name,
          file.size,
          file.type || 'application/octet-stream',
          currentFolderId,
        );

        if (initRes.upload_mode === 'single') {
          // Step 2a: Single-file upload — send entire file directly
          await apiUploadSingle(initRes.file_id, file);
          setUploadProgress(`${prefix}100%`);

          // Step 3a: Complete — no parts to report for single mode
          await apiCompleteUpload(initRes.file_id, []);
        } else {
          // Step 2b: Multipart upload — split file into 5MB chunks and upload concurrently
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
          const chunkTasks = [];

          for (let partNum = 1; partNum <= totalChunks; partNum++) {
            const start = (partNum - 1) * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            chunkTasks.push({
              partNum,
              chunk: file.slice(start, end),
            });
          }

          let completedChunks = 0;
          const parts = await runConcurrentTasks(
            chunkTasks,
            CONCURRENT_CHUNKS,
            async (task) => {
              const partRes = await apiUploadPart(initRes.file_id, task.partNum, task.chunk);
              completedChunks++;
              const percent = Math.min(100, Math.round((completedChunks / totalChunks) * 100));
              setUploadProgress(`${prefix}${percent}%`);
              return { part_number: partRes.part_number, etag: partRes.etag };
            },
          );

          // Step 3b: Complete — send all part ETags so S3 can assemble them
          setUploadProgress(`${prefix}Saving...`);
          await apiCompleteUpload(initRes.file_id, parts);
        }
      } catch (err: any) {
        console.error('Upload failed:', err);
        alert(`Failed to upload ${file.name}: ${err.detail || err.message}`);
      }
    }

    setUploading(false);
    setUploadProgress('');
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onUploadComplete();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        onClick={handleClick}
        disabled={uploading}
        className="bg-white text-[#0a0a0a] hover:bg-white/90 h-8 sm:h-9 px-2.5 sm:px-4 rounded-lg text-[12px] sm:text-[13px] font-semibold gap-1.5 sm:gap-2 shrink-0"
      >
        {uploading ? (
          <>
            <RiLoader4Line className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            <span className="max-w-[80px] sm:max-w-[120px] truncate">{uploadProgress}</span>
          </>
        ) : (
          <>
            <RiUploadCloud2Line className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Upload</span>
          </>
        )}
      </Button>
    </>
  );
}

