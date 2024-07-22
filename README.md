## Deployment with Docker
First, build the docker container for `account-abstraction`
```bash
touch .env
# next put
# DEPLOYER_PRIVATE_KEY=0x...
# in the .env file, which corresponds to a private key with sufficient balance to deploy on your chain
docker build --platform linux/amd64 -t aa .
```
### VRF Oracle
```bash
docker run aa ./script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
# take note of the address that is returned by this script, and save it somewhere
```
