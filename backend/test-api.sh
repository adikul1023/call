#!/bin/bash
# Backend API Test Script

echo "========================================="
echo "SecureVoice Backend API Tests"
echo "========================================="
echo ""

API_URL="https://localhost:3000/api"

# Test 1: Health Check
echo "Test 1: Health Check"
curl -sk $API_URL/health
echo -e "\n"

# Test 2: Register Alice
echo "Test 2: Register User Alice"
curl -sk -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass123"}'
echo -e "\n"

# Test 3: Register Bob
echo "Test 3: Register User Bob"
curl -sk -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"pass123"}'
echo -e "\n"

# Test 4: Login Alice
echo "Test 4: Login Alice"
curl -sk -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass123"}'
echo -e "\n"

# Test 5: Initiate Call (creates tunnel for user 1)
echo "Test 5: Initiate Call - Creates WireGuard Tunnel"
CALL_RESPONSE=$(curl -sk -X POST $API_URL/calls/initiate \
  -H "Content-Type: application/json" \
  -d '{"callerId":1,"calleeId":2}')
echo "$CALL_RESPONSE" | python3 -m json.tool
echo -e "\n"

# Extract callId
CALL_ID=$(echo "$CALL_RESPONSE" | grep -o '"callId":"[^"]*"' | cut -d'"' -f4)
echo "Call ID: $CALL_ID"
echo -e "\n"

# Test 6: Check active tunnels
echo "Test 6: Check Active Tunnels"
curl -sk $API_URL/tunnels/active | python3 -m json.tool
echo -e "\n"

# Test 7: Check WireGuard status
echo "Test 7: WireGuard Server Status"
sudo wg show
echo -e "\n"

echo "========================================="
echo "✅ Tests Complete!"
echo "========================================="
