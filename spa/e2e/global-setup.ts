import { chromium, FullConfig } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';

async function setupGroupAndTeacher(apiURL: string, accessToken: string, groupId: string) {
    console.log('📝 Adding basic whitelist rules...');
    const rulesResponse = await fetch(`${apiURL}/trpc/groups.bulkCreateRules`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            groupId,
            type: 'whitelist',
            values: ['google.com', 'github.com']
        })
    });
    
    if (rulesResponse.ok) {
        console.log('✅ Whitelist rules added');
    } else {
        const errorText = await rulesResponse.text();
        console.log(`⚠️  Rules creation failed: ${errorText}`);
    }

    console.log('👨‍🏫 Assigning teacher to default-group...');
    const usersResponse = await fetch(`${apiURL}/trpc/users.list`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    if (usersResponse.ok) {
        const usersData = await usersResponse.json() as { result?: { data?: { id?: string; email?: string }[] } };
        const teacher = usersData.result?.data?.find(u => u.email === TEACHER_CREDENTIALS.email);
        
        if (teacher?.id) {
            const assignResponse = await fetch(`${apiURL}/trpc/users.assignRole`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    userId: teacher.id,
                    role: 'teacher',
                    groupIds: [groupId]
                })
            });
            
            if (assignResponse.ok) {
                console.log('✅ Teacher assigned to default-group');
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const verifyResponse = await fetch(`${apiURL}/trpc/users.list`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (verifyResponse.ok) {
                    const verifyData = await verifyResponse.json() as { result?: { data?: { id?: string; email?: string; roles?: { role?: string; groupIds?: string[] }[] }[] } };
                    const verifiedTeacher = verifyData.result?.data?.find(u => u.email === TEACHER_CREDENTIALS.email);
                    const teacherRole = verifiedTeacher?.roles?.find(r => r.role === 'teacher');
                    
                    if (teacherRole?.groupIds?.includes(groupId)) {
                        console.log('✅ Teacher group assignment verified');
                    } else {
                        console.log('⚠️  Teacher group assignment not reflected in user list');
                    }
                } else {
                    console.log('⚠️  Failed to verify teacher assignment');
                }
            } else {
                const errorText = await assignResponse.text();
                console.log(`⚠️  Teacher group assignment failed: ${errorText}`);
            }
        } else {
            console.log('⚠️  Teacher not found in user list');
        }
    } else {
        console.log('⚠️  Failed to fetch user list');
    }
}

async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0]?.use.baseURL;
    const apiURL = process.env.API_URL ?? baseURL ?? 'http://localhost:3005';
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Capture ALL console output for debugging
    page.on('console', msg => {
        console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
    });
    
    page.on('response', response => {
        const status = response.status();
        const url = response.url();
        if (status === 404) {
            console.log(`[BROWSER 404] ${url}`);
        }
        if (status >= 400) {
            console.log(`[BROWSER ${String(status)}] ${url}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`[BROWSER PAGE ERROR] ${error.message}`);
    });

    try {
        if (!baseURL) {
            throw new Error('baseURL is required for global setup');
        }
        
        await page.goto(baseURL);
        await page.waitForLoadState('load');
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

        await page.evaluate((apiUrl) => {
            localStorage.setItem('requests_api_url', apiUrl);
        }, apiURL);
        
        console.log(`📝 Set API URL in localStorage: ${apiURL}`);
        console.log('🔄 Reloading page to apply API URL...');
        await page.reload();
        await page.waitForLoadState('load');
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

        const setupHeading = page.locator('text=Configuración inicial');
        if (await setupHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('🔧 Running first-time setup...');
            await page.fill('input[type="email"]', ADMIN_CREDENTIALS.email);
            await page.fill('input[placeholder="Nombre completo"]', ADMIN_CREDENTIALS.name);
            const passwordInputs = page.locator('input[type="password"]');
            await passwordInputs.nth(0).fill(ADMIN_CREDENTIALS.password);
            await passwordInputs.nth(1).fill(ADMIN_CREDENTIALS.password);
            console.log('📝 Filled setup form, clicking submit...');
            await page.click('button[type="submit"]');
            
            console.log('⏳ Waiting for setup complete (token display)...');
            await page.waitForSelector('text=Token de registro', { timeout: 10000 });
            console.log('✅ Setup complete');
        }

        console.log('🔐 Logging in as admin...');
        await page.goto(baseURL);
        await page.waitForLoadState('load');

        console.log('⏳ Waiting for login screen to become visible...');
        await page.waitForSelector('text=Iniciar sesión', { 
            timeout: 10000,
            state: 'visible'
        });
        console.log('✅ Login screen is visible');
        
        await page.fill('input[type="email"]', ADMIN_CREDENTIALS.email);
        await page.fill('input[type="password"]', ADMIN_CREDENTIALS.password);
        await page.click('button[type="submit"]:has-text("Entrar")');
        
        console.log('⏳ Waiting for dashboard to appear...');
        const dashboardVisible = await page.waitForSelector('text=Panel de control', { 
            timeout: 30000,
            state: 'visible'
        }).catch((e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            console.error('❌ Dashboard screen never appeared:', message);
            return null;
        });
        
        if (!dashboardVisible) {
            const currentUrl = page.url();
            console.error(`❌ Current URL: ${currentUrl}`);
            throw new Error(`Dashboard screen not visible. Current URL: ${currentUrl}`);
        }
        
        console.log('✅ Dashboard visible, waiting for sidebar...');
        await page.waitForSelector('text=Grupos', { timeout: 10000, state: 'visible' });
        console.log('✅ Admin logged in successfully');

        const accessToken = await page.evaluate(() => localStorage.getItem('openpath_access_token'));
        if (!accessToken) {
            throw new Error('No access token found after admin login');
        }

        console.log('👨‍🏫 Creating teacher user via API...');
        try {
            const teacherResponse = await fetch(`${apiURL}/trpc/users.create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    email: TEACHER_CREDENTIALS.email,
                    name: TEACHER_CREDENTIALS.name,
                    password: TEACHER_CREDENTIALS.password,
                    role: 'teacher',
                    groupIds: []
                })
            });
            
            if (teacherResponse.ok) {
                console.log('✅ Teacher created');
            } else {
                const errorText = await teacherResponse.text();
                console.log(`⚠️  Teacher creation failed (${String(teacherResponse.status)}): ${errorText}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`⚠️  Teacher creation error: ${errorMessage}`);
        }

        console.log('🎓 Creating student user via API...');
        try {
            const studentResponse = await fetch(`${apiURL}/trpc/users.create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    email: STUDENT_CREDENTIALS.email,
                    name: STUDENT_CREDENTIALS.name,
                    password: STUDENT_CREDENTIALS.password,
                    role: 'student',
                    groupIds: []
                })
            });
            
            if (studentResponse.ok) {
                console.log('✅ Student created');
            } else {
                const errorText = await studentResponse.text();
                console.log(`⚠️  Student creation failed (${String(studentResponse.status)}): ${errorText}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`⚠️  Student creation error: ${errorMessage}`);
        }

        console.log('📋 Creating default whitelist group via API...');
        try {
            const groupResponse = await fetch(`${apiURL}/trpc/groups.create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    name: 'default-group',
                    displayName: 'Default Group'
                })
            });
            
            if (groupResponse.ok) {
                const groupData = await groupResponse.json() as { result?: { data?: { id?: string } } };
                console.log('✅ Default whitelist group created:', groupData);
                
                const groupId = groupData.result?.data?.id;
                if (typeof groupId === 'string') {
                    await setupGroupAndTeacher(apiURL, accessToken, groupId);
                }
            } else if (groupResponse.status === 409) {
                // Group already exists, fetch it and continue setup
                console.log('ℹ️  Default group already exists, fetching ID...');
                const listResponse = await fetch(`${apiURL}/trpc/groups.list`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (listResponse.ok) {
                    const listData = await listResponse.json() as { result?: { data?: { id?: string; name?: string }[] } };
                    const existingGroup = listData.result?.data?.find(g => g.name === 'default-group');
                    if (existingGroup?.id) {
                        console.log('✅ Found existing default-group:', existingGroup.id);
                        await setupGroupAndTeacher(apiURL, accessToken, existingGroup.id);
                    } else {
                        console.log('⚠️  Could not find default-group in list');
                    }
                }
            } else {
                const errorText = await groupResponse.text();
                console.log(`⚠️  Whitelist group creation failed (${String(groupResponse.status)}): ${errorText}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`⚠️  Whitelist group creation error: ${errorMessage}`);
        }
        
        console.log('🔍 Final verification: checking teacher permissions...');
        try {
            const finalVerifyResponse = await fetch(`${apiURL}/trpc/users.list`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (finalVerifyResponse.ok) {
                const finalVerifyData = await finalVerifyResponse.json() as { result?: { data?: { email?: string; roles?: { role?: string; groupIds?: string[] }[] }[] } };
                const finalTeacher = finalVerifyData.result?.data?.find(u => u.email === TEACHER_CREDENTIALS.email);
                const finalTeacherRole = finalTeacher?.roles?.find(r => r.role === 'teacher');
                
                if (finalTeacherRole?.groupIds && finalTeacherRole.groupIds.length > 0) {
                    console.log('✅ Teacher has groups:', finalTeacherRole.groupIds);
                } else {
                    console.warn('⚠️  WARNING: Teacher has no groups assigned! Tests may fail.');
                }
            }
        } catch (error) {
            console.log('⚠️  Final verification failed:', error);
        }
        
        console.log('✅ Global setup complete');

    } catch (error) {
        console.error('❌ Global setup failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

export default globalSetup;
