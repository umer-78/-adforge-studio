'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api-client';

export function AcceptInvite({ token, workspace }: { token: string; workspace: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.post<{ workspaceId: string }>('/invites/accept', { token }),
    onSuccess: () => {
      toast.success(`You joined ${workspace}.`);
      // Anything cached belongs to the workspace they were in before.
      qc.clear();
      router.push('/dashboard');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button size="lg" className="w-full" loading={accept.isPending || accept.isSuccess} onClick={() => accept.mutate()}>
      Join {workspace}
    </Button>
  );
}
