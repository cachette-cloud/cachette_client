'use client';

import { useState, useEffect } from 'react';
import type { FileOut } from '@/lib/api';
import { apiShareFile, type ShareResponse } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  RiShareForwardLine,
  RiFileCopyLine,
  RiCheckLine,
  RiEyeLine,
  RiDownloadLine,
  RiLoader4Line,
} from 'react-icons/ri';

interface ShareModalProps {
  file: FileOut | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareModal({ file, open, onOpenChange }: ShareModalProps) {
  const [accessLevel, setAccessLevel] = useState<'view' | 'download'>('view');
  const [shareData, setShareData] = useState<ShareResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch or create share link whenever modal opens or access level changes
  useEffect(() => {
    if (!open || !file) {
      setShareData(null);
      setCopied(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    apiShareFile(file.id, accessLevel)
      .then((data) => {
        if (isMounted) {
          setShareData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to create share link');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, file, accessLevel]);

  const handleCopy = async () => {
    if (!shareData?.url) return;
    try {
      await navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const input = document.getElementById('share-url-input') as HTMLInputElement;
      if (input) {
        input.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/[0.08] max-w-[92vw] sm:max-w-md rounded-2xl p-5 sm:p-6 text-white shadow-2xl">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <RiShareForwardLine className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-white text-[16px] font-semibold">Share File</DialogTitle>
              <DialogDescription className="text-white/40 text-[12px] truncate max-w-[280px] sm:max-w-xs">
                {file?.filename}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Access Level Selector */}
          <div>
            <label className="text-white/50 text-[11px] font-medium uppercase tracking-wider block mb-2">
              Access Level
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#0c0c0c] p-1 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setAccessLevel('view')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[13px] font-medium transition-all ${
                  accessLevel === 'view'
                    ? 'bg-white/[0.1] text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <RiEyeLine className="w-3.5 h-3.5" />
                <span>View</span>
              </button>
              <button
                type="button"
                onClick={() => setAccessLevel('download')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[13px] font-medium transition-all ${
                  accessLevel === 'download'
                    ? 'bg-white/[0.1] text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <RiDownloadLine className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
            <p className="text-white/30 text-[11px] mt-1.5 px-0.5">
              {accessLevel === 'view'
                ? 'Preview in browser when supported, or download otherwise.'
                : 'Directly triggers file download on opening.'}
            </p>
          </div>

          {/* Share Link Display & Copy */}
          <div>
            <label className="text-white/50 text-[11px] font-medium uppercase tracking-wider block mb-2">
              Public Link
            </label>

            {isLoading ? (
              <div className="flex items-center justify-center py-6 bg-[#0a0a0a] border border-white/[0.06] rounded-xl text-white/40 text-[13px] gap-2">
                <RiLoader4Line className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Generating share link...</span>
              </div>
            ) : error ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[12px]">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (file) {
                      setIsLoading(true);
                      setError(null);
                      apiShareFile(file.id, accessLevel)
                        .then(setShareData)
                        .catch((e) => setError(e.message))
                        .finally(() => setIsLoading(false));
                    }
                  }}
                  className="mt-2 text-red-300 underline font-medium"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-white/[0.08] rounded-xl p-1.5 focus-within:border-indigo-500/50 transition-colors">
                <input
                  id="share-url-input"
                  type="text"
                  readOnly
                  value={shareData?.url || ''}
                  className="w-full bg-transparent px-2.5 py-1 text-[13px] text-white/90 outline-none select-all font-mono"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  onClick={handleCopy}
                  className={`h-8 px-3 rounded-lg text-[12px] font-medium shrink-0 transition-all ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <RiCheckLine className="w-3.5 h-3.5 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <RiFileCopyLine className="w-3.5 h-3.5 mr-1" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-white/[0.05] flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/[0.08] text-white/60 hover:text-white text-[13px] h-8 px-4 rounded-lg"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
