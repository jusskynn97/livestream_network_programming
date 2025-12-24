"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import DefaultLayout from '@/components/custom/default-layout';
import { createBrowserClient } from '@/lib/pocketbase/createBrowserClient';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import VideoComments from '@/components/custom/video-comments';
import EditVideoModal from '@/components/custom/edit-video-modal';

export default function Page() {
    const client = createBrowserClient();
    const pathname = usePathname();
    const id = pathname?.split('/').pop();
    const [recording, setRecording] = useState<any>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const user = client.authStore.model;

    useEffect(() => {
        const fetchRecording = async () => {
            if (!id) return;
            try {
                const rec = await client.collection('recordings').getOne(id, { expand: 'user,stream' });
                setRecording(rec);
                const url = client.files.getUrl(rec, rec.video_file);
                setVideoUrl(url);
            } catch (error) {
                console.error("Failed to fetch recording", error);
                setRecording({ exists: false });
            }
        };

        fetchRecording();
    }, [id]);

    if (recording && recording.exists === false) {
        return (
             <DefaultLayout>
                <div className="flex justify-center items-center h-96">
                    <h1 className="text-4xl font-bold">Recording not found</h1>
                </div>
            </DefaultLayout>
        );
    }

    return (
        <DefaultLayout>
            <div className="p-6 flex flex-col">
                {!recording ? (
                    <Skeleton className="w-full h-[30rem]" />
                ) : (
                    <div className="flex flex-col space-y-4">
                        <div className="w-full bg-black rounded-xl overflow-hidden aspect-video max-h-[70vh]">
                            {videoUrl && (
                                <video
                                    src={videoUrl}
                                    poster={recording?.thumbnail 
                                        ? client.files.getUrl(recording, recording.thumbnail) 
                                        : (recording?.expand?.stream?.thumbnail 
                                            ? client.files.getUrl(recording.expand.stream, recording.expand.stream.thumbnail) 
                                            : undefined)}
                                    controls
                                    className="w-full h-full object-contain"
                                    autoPlay
                                />
                            )}
                        </div>
                        
                        <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                                <h1 className="text-3xl font-bold">{recording.title}</h1>
                                {user?.id === recording.user && <EditVideoModal recording={recording} />}
                            </div>
                            <div className="flex items-center space-x-4">
                                <Link href={`/user/${recording.expand?.user?.username}`} className="flex items-center space-x-2">
                                    <Avatar>
                                        <AvatarImage src={client.files.getUrl(recording.expand?.user, recording.expand?.user?.avatar)} />
                                        <AvatarFallback>{recording.expand?.user?.username?.[0]}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-semibold text-lg hover:underline">{recording.expand?.user?.username}</span>
                                </Link>
                                <span className="text-gray-400 text-sm">
                                    Recorded on {new Date(recording.created).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                                </span>
                            </div>
                        </div>
                        <VideoComments videoId={recording.id} />
                    </div>
                )}
            </div>
        </DefaultLayout>
    );
}
