const PocketBase = require('pocketbase/cjs');
require('dotenv').config();

const pb = new PocketBase("http://127.0.0.1:8090");

async function updateSchema() {
    try {
        await pb.admins.authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);
        console.log("Authenticated as admin");

        // 1. Add 'thumbnail' to 'recordings'
        try {
            const recordings = await pb.collections.getOne('recordings');
            const hasThumbnail = recordings.schema.find(f => f.name === 'thumbnail');
            if (!hasThumbnail) {
                console.log("Adding 'thumbnail' field to 'recordings'...");
                recordings.schema.push({
                    name: 'thumbnail',
                    type: 'file',
                    required: false,
                    options: {
                        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
                        maxSize: 1024 * 1024 * 5, // 5MB
                        maxSelect: 1
                    }
                });
                await pb.collections.update('recordings', recordings);
                console.log("'recordings' collection updated.");
            } else {
                console.log("'thumbnail' field already exists in 'recordings'.");
            }
        } catch (e) {
            console.error("Error updating 'recordings':", e);
        }

        // 2. Create 'comments' collection
        try {
            await pb.collections.getOne('comments');
            console.log("'comments' collection already exists.");
        } catch (e) {
            if (e.status === 404) {
                console.log("Creating 'comments' collection...");
                await pb.collections.create({
                    name: 'comments',
                    type: 'base',
                    schema: [
                        {
                            name: 'user',
                            type: 'relation',
                            required: true,
                            options: {
                                collectionId: '_pb_users_auth_',
                                cascadeDelete: false,
                                maxSelect: 1
                            }
                        },
                        {
                            name: 'recording',
                            type: 'relation',
                            required: true,
                            options: {
                                collectionId: (await pb.collections.getOne('recordings')).id,
                                cascadeDelete: true,
                                maxSelect: 1
                            }
                        },
                        {
                            name: 'content',
                            type: 'text',
                            required: true
                        }
                    ],
                    listRule: '',
                    viewRule: '',
                    createRule: '@request.auth.id != ""',
                    updateRule: 'user = @request.auth.id',
                    deleteRule: 'user = @request.auth.id'
                });
                console.log("'comments' collection created.");
            } else {
                console.error("Error checking 'comments':", e);
            }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

updateSchema();
