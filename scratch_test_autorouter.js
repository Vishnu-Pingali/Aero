import fs from 'fs';
import axios from 'axios';

async function main() {
  try {
    // 1. Read credentials
    const credentialsRaw = fs.readFileSync('v:/BUP/credentials.json', 'utf8');
    const credentials = JSON.parse(credentialsRaw);
    console.log('Credentials loaded:', {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret ? '***' : 'missing'
    });

    // 2. Authenticate
    const tokenUrl = 'https://api.autorouter.aero/v1.0/oauth2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', credentials.clientId);
    params.append('client_secret', credentials.clientSecret);

    console.log('Fetching access token...');
    const tokenRes = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = tokenRes.data.access_token;
    console.log('Access token retrieved successfully:', accessToken.substring(0, 10) + '...');

    // 3. Probing /aircraft endpoint
    console.log('Listing aircraft...');
    const aircraftRes = await axios.get('https://api.autorouter.aero/v1.0/aircraft', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    console.log('Aircraft Response Status:', aircraftRes.status);
    console.log('Aircraft Response Data:', JSON.stringify(aircraftRes.data, null, 2));

  } catch (error) {
    console.error('Error occurred:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

main();
