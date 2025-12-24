"use client"

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash } from "lucide-react";

export default function VideoComments({ videoId, videoOwnerId }: { videoId: string, videoOwnerId: string }) {
    const client = createBrowserClient();
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const user = client.authStore.model;

    const fetchComments = async () => {
        try {
            const res = await client.collection('comments').getList(1, 50, {
                filter: `recording="${videoId}"`,
                sort: '-created',
                expand: 'user'
            });
            setComments(res.items);
        } catch (e) {
            console.error(e);
        }
    }

    useEffect(() => {
        fetchComments();
        
        client.collection('comments').subscribe('*', (e) => {
            if (e.record.recording === videoId) {
                fetchComments();
            }
        });

        return () => {
            client.collection('comments').unsubscribe('*');
        }
    }, [videoId]);

    const postComment = async () => {
        if (!newComment.trim()) return;
        setIsLoading(true);
        try {
            await client.collection('comments').create({
                user: user?.id,
                recording: videoId,
                content: newComment
            });

            // Create Notification
            if (user?.id !== videoOwnerId) {
                await client.collection('notifications').create({
                    user: videoOwnerId,
                    actor: user?.id,
                    type: 'comment',
                    message: `${user?.username} commented on your video`,
                    is_read: false,
                    related_id: `/watch/${videoId}`
                });
            }

            setNewComment("");
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }

    const deleteComment = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            await client.collection('comments').delete(id);
        } catch (e) {
            console.error(e);
        }
    }

    return (
        <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4">Comments</h2>
            
            {user ? (
                <div className="flex space-x-4 mb-8">
                    <Avatar>
                        <AvatarImage src={client.files.getUrl(user, user.avatar)} />
                        <AvatarFallback>{user.username[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col w-full gap-2">
                        <Textarea 
                            placeholder="Add a comment..." 
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                        />
                        <div className="flex justify-end">
                            <Button onClick={postComment} disabled={isLoading || !newComment.trim()}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Comment
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <p className="mb-8 text-muted-foreground">Please login to comment.</p>
            )}

            <div className="space-y-6">
                {comments.map((comment) => (
                    <div key={comment.id} className="flex space-x-4">
                        <Avatar>
                            <AvatarImage src={client.files.getUrl(comment.expand?.user, comment.expand?.user?.avatar)} />
                            <AvatarFallback>{comment.expand?.user?.username?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col flex-grow">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold">{comment.expand?.user?.username}</span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(comment.created).toLocaleString()}
                                </span>
                            </div>
                            <p className="mt-1 text-sm">{comment.content}</p>
                        </div>
                        {(user?.id === comment.user || user?.id === comment.expand?.recording?.user) && (
                            <Button variant="ghost" size="icon" onClick={() => deleteComment(comment.id)}>
                                <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
