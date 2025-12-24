const PocketBase = require('pocketbase/cjs');
require('dotenv').config();

const pb = new PocketBase("http://127.0.0.1:8090");

async function setup() {
    try {
        await pb.admins.authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);
        console.log("Authenticated as admin");

        try {
            await pb.collection('recordings').getList(1, 1);
            console.log("'recordings' collection already exists.");
        } catch (e) {
            if (e.status === 404) {
                console.log("Creating 'recordings' collection...");
                
                // Get streams collection ID
                const streamsCollection = await pb.collections.getOne('streams'); // Or by name if possible, getOne takes ID or name? SDK says getOne(id). getFirstListItem might work on 'collections' system collection? No.
                // Actually, I can search for it.
                // But I know the ID from pb_schema.json: i7lzbss7m6u84sv.
                // Also users ID: _pb_users_auth_.
                
                await pb.collections.create({
                    name: 'recordings',
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
                            name: 'stream',
                            type: 'relation',
                            required: false,
                            options: {
                                collectionId: 'i7lzbss7m6u84sv',
                                cascadeDelete: false,
                                maxSelect: 1
                            }
                        },
                        {
                            name: 'title',
                            type: 'text',
                            required: true
                        },
                        {
                            name: 'video_file',
                            type: 'file',
                            required: true,
                            options: {
                                mimeTypes: ['video/mp4', 'video/x-flv'],
                                maxSize: 1024 * 1024 * 1024 * 5, // 5GB
                                maxSelect: 1
                            }
                        },
                        {
                            name: 'duration',
                            type: 'text'
                        }
                    ],
                    listRule: '',
                    viewRule: '',
                    createRule: '@request.auth.id != ""',
                    updateRule: 'user = @request.auth.id',
                    deleteRule: 'user = @request.auth.id'
                });
                console.log("'recordings' collection created.");
            } else {
                throw e;
            }
        }
    } catch (error) {
        console.error("Error setting up database:", error);
        if (error.response && error.response.data) {
            console.log(JSON.stringify(error.response.data, null, 2));
        }
    }
}

setup();
