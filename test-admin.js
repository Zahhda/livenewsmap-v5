// Test script for admin users and messaging functionality
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';

async function testAdminUsers() {
  console.log('Testing admin users functionality...');
  
  try {
    // Test admin users endpoint
    const response = await fetch(`${BASE_URL}/api/admin/users`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    
    console.log('Admin users endpoint status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Users found:', data.users?.length || 0);
    } else {
      const error = await response.text();
      console.log('Error:', error);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

async function testMessages() {
  console.log('Testing messages functionality...');
  
  try {
    // Test messages endpoint
    const response = await fetch(`${BASE_URL}/api/messages/admin/users`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    
    console.log('Messages admin users endpoint status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Users for messaging found:', data.users?.length || 0);
    } else {
      const error = await response.text();
      console.log('Error:', error);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

async function runTests() {
  console.log('Starting admin functionality tests...\n');
  
  await testAdminUsers();
  console.log('');
  await testMessages();
  
  console.log('\nTests completed!');
}

runTests();
