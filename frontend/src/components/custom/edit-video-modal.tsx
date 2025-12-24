"use client"

import { useState } from "react";
import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

export default function EditVideoModal({ recording }: { recording: any }) {
    const client = createBrowserClient();
    const [title, setTitle] = useState(recording.title);
    const [thumbnail, setThumbnail] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('title', title);
            if (thumbnail) {
                formData.append('thumbnail', thumbnail);
            }

            await client.collection('recordings').update(recording.id, formData);
            setOpen(false);
            router.refresh();
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Video Details</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdate} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input 
                            id="title" 
                            value={title} 
                            onChange={(e) => setTitle(e.target.value)} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="thumbnail">Thumbnail</Label>
                        <Input 
                            id="thumbnail" 
                            type="file" 
                            accept="image/*"
                            onChange={(e) => setThumbnail(e.target.files?.[0] || null)} 
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave empty to keep current thumbnail.
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
