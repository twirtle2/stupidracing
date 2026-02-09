'use client';

import { useTournamentContract } from '@/hooks/useTournamentContract';
import { useEffect, useState } from 'react';

const STATE_MAP: Record<number, string> = {
    0: 'Created',
    1: 'Open for Registration',
    2: 'Locked (Ready)',
    3: 'Racing',
    4: 'Completed',
    5: 'Cancelled'
};

export function TournamentStatus() {
    const contract = useTournamentContract();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [info, setInfo] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function loadInfo() {
            if (!contract) return;
            try {
                setLoading(true);
                // Pass args: [] for methods with no arguments as per generated client types
                const response = await contract.send.getTournamentInfo({ args: [] });
                setInfo(response.return);
            } catch (e) {
                console.error('Failed to load tournament info:', e);
            } finally {
                setLoading(false);
            }
        }

        if (contract) {
            loadInfo();
        }
    }, [contract]);

    if (!contract) return null;
    if (!info && loading) return <div className="text-white/50 animate-pulse text-xs">Loading status...</div>;
    if (!info) return null; // Don't show error to keep UI clean if it fails initially

    return (
        <div className="w-full max-w-md p-4 mb-6 rounded-2xl bg-gradient-to-br from-purple-900/40 to-black border border-white/10 backdrop-blur-sm shadow-xl">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                    Season {Number(info.season)}
                </h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${Number(info.state) === 1 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-700/50 text-gray-400 border border-white/5'
                    }`}>
                    {STATE_MAP[Number(info.state)] || 'Unknown'}
                </span>
            </div>

            <div className="space-y-3">
                <div className="flex justify-between text-xs">
                    <span className="text-gray-400 font-medium">Contestants</span>
                    <span className="font-mono text-white">
                        {Number(info.registeredCount)} / {Number(info.bracketSize)}
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-1000 ${Number(info.state) === 1 ? 'bg-green-500' : 'bg-yellow-500'}`}
                        style={{ width: `${(Number(info.registeredCount) / Number(info.bracketSize)) * 100}%` }}
                    />
                </div>

                <div className="flex justify-end">
                    <button
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onClick={() => (contract as any)?.send?.getTournamentInfo({ args: [] }).then((res: any) => setInfo(res.return))}
                        disabled={loading}
                        className="text-[10px] uppercase tracking-widest text-[var(--muted)] hover:text-white transition-colors flex items-center gap-1"
                    >
                        {loading ? (
                            <span className="animate-spin">⟳</span>
                        ) : (
                            <span>⟳</span>
                        )}
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
}
