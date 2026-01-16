import { chromium, FullConfig } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';

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

        await page.evaluate((apiUrl) => {
            localStorage.setItem('requests_api_url', apiUrl);
        }, apiURL);
        
        console.log(`📝 Set API URL in localStorage: ${apiURL}`);
        console.log('🔄 Reloading page to apply API URL...');
        await page.reload();
        await page.waitForLoadState('load');

        const setupHeader = page.locator('#setup-header');
        if (await setupHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('🔧 Running first-time setup...');
            await page.fill('#setup-email', ADMIN_CREDENTIALS.email);
            await page.fill('#setup-name', ADMIN_CREDENTIALS.name);
            await page.fill('#setup-password', ADMIN_CREDENTIALS.password);
            await page.fill('#setup-password-confirm', ADMIN_CREDENTIALS.password);
            console.log('📝 Filled setup form, clicking submit...');
            await page.click('#setup-submit-btn');
            
            console.log('⏳ Waiting for setup complete container to appear...');
            await page.waitForSelector('#setup-complete-container', { timeout: 10000 });
            console.log('✅ Setup complete');
        }

        console.log('🔐 Logging in as admin...');
        await page.goto(baseURL);
        await page.waitForLoadState('load');

        console.log('⏳ Waiting for login screen to become visible...');
        await page.waitForSelector('#login-screen:not(.hidden)', { 
            timeout: 10000,
            state: 'visible'
        });
        console.log('✅ Login screen is visible');
        
        await page.fill('#login-email', ADMIN_CREDENTIALS.email);
        await page.fill('#login-password', ADMIN_CREDENTIALS.password);
        await page.click('#email-login-btn');
        
        console.log('⏳ Waiting for dashboard to appear...');
        const dashboardVisible = await page.waitForSelector('#dashboard-screen:not(.hidden)', { 
            timeout: 30000,
            state: 'visible'
        }).catch((e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            console.error('❌ Dashboard screen never appeared:', message);
            return null;
        });
        
        if (!dashboardVisible) {
            const currentScreen = await page.evaluate(() => {
                const screens = Array.from(document.querySelectorAll('.screen'));
                const visible = screens.find(s => !s.classList.contains('hidden'));
                return visible?.id ?? 'none';
            });
            console.error(`❌ Current visible screen: ${currentScreen}`);
            throw new Error(`Dashboard screen not visible. Current screen: ${currentScreen}`);
        }
        
        console.log('✅ Dashboard visible, waiting for logout button...');
        await page.waitForSelector('#logout-btn', { timeout: 10000, state: 'visible' });
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
                }
            } else {
                const errorText = await groupResponse.text();
                console.log(`⚠️  Whitelist group creation failed (${String(groupResponse.status)}): ${errorText}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`⚠️  Whitelist group creation error: ${errorMessage}`);
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
