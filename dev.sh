#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$SCRIPT_DIR/zephyr-client"
SERVER_DIR="$SCRIPT_DIR/zephyr-server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Zephyr Dev Server Starter${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: bun is not installed. Please install bun first.${NC}"
    exit 1
fi

# Cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down dev servers...${NC}"
    # Kill child processes in our process group
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null
    fi
    if [ -n "$CLIENT_PID" ] && kill -0 "$CLIENT_PID" 2>/dev/null; then
        kill "$CLIENT_PID" 2>/dev/null
    fi
    wait 2>/dev/null
    echo -e "${GREEN}All servers stopped.${NC}"
}
trap cleanup EXIT INT TERM

# Start backend (NestJS + Bun watch)
echo -e "${YELLOW}Starting backend (NestJS)...${NC}"
cd "$SERVER_DIR"
nohup bun run dev > /tmp/zephyr-server.log 2>&1 &
SERVER_PID=$!
echo "  Backend PID: $SERVER_PID"

# Wait for backend to be ready (health check)
echo -e "${YELLOW}Waiting for backend to start...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo -e "${RED}Backend crashed. Check /tmp/zephyr-server.log${NC}"
        cat /tmp/zephyr-server.log
        exit 1
    fi
    if curl -s http://localhost:5010/health > /dev/null 2>&1; then
        echo -e "${GREEN}  Backend is ready!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 0.5
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo -e "${RED}Backend failed to start within timeout.${NC}"
    echo "  Check logs: cat /tmp/zephyr-server.log"
    exit 1
fi

# Start frontend (Vite dev server)
echo -e "${YELLOW}Starting frontend (Vite)...${NC}"
cd "$CLIENT_DIR"
nohup bun run dev > /tmp/zephyr-client.log 2>&1 &
CLIENT_PID=$!
echo "  Frontend PID: $CLIENT_PID"

# Wait for frontend to be ready
echo -e "${YELLOW}Waiting for frontend to start...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ! kill -0 "$CLIENT_PID" 2>/dev/null; then
        echo -e "${RED}Frontend crashed. Check /tmp/zephyr-client.log${NC}"
        cat /tmp/zephyr-client.log
        exit 1
    fi
    if curl -s http://192.168.1.200:5011/ > /dev/null 2>&1; then
        echo -e "${GREEN}  Frontend is ready!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 0.5
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo -e "${RED}Frontend failed to start within timeout.${NC}"
    echo "  Check logs: cat /tmp/zephyr-client.log"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Frontend: ${GREEN}http://192.168.1.200:5011${NC}"
echo -e "  Backend:  ${GREEN}http://192.168.1.200:5010${NC}"
echo -e "  API Docs: ${GREEN}http://192.168.1.200:5010/api/docs${NC}"
echo ""
echo -e "  Logs:"
echo -e "    Backend:  ${YELLOW}tail -f /tmp/zephyr-server.log${NC}"
echo -e "    Frontend: ${YELLOW}tail -f /tmp/zephyr-client.log${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all servers"
echo ""

# Wait for either process to exit
wait
