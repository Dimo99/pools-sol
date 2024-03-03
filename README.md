# Privacy-Pools

Fork of `https://github.com/ameensol/privacy-pools` project.

# Features

-   Deposited funds cannot be locked or stolen (non-custodial and non-restrictive)
-   Zero knowledge proofs secure user's privacy
-   Users have the freedom to choose an anonymity set upon withdrawal
-   Removing illicit deposits from an anonymity subset accomplished two things:
    -   Proves a withdrawal is clean without violating the privacy of the specific user, and
    -   Reduces the anonymity sets of hackers, acting as a deterrent and as a dampening force for illicit activity
-   Enables customizable community driven anti blackhat and anti money laundering coordination in a credibly neutral way

## Read More
You can read more about privacy pools in [docs](./docs).

# Dependencies

-   [npm](https://www.npmjs.com/) / [yarn](https://yarnpkg.com/)
-   [rust](https://www.rust-lang.org/tools/install) / [circom2](https://docs.circom.io/getting-started/installation/)
-   [python3](https://www.python.org/downloads/)
-   [snarkjs v0.6.9](https://www.npmjs.com/package/snarkjs/v/0.6.9)

# Install and Test Locally
Only tested on a UNIX-like OS (linux or mac).

## Clone the Repo
```sh
$ git clone https://github.com/ameensol/privacy-pools
$ cd pools-sol
```

## Install Dependencies
```sh
$ yarn
```

or

```sh
$ npm install .
```

## Setup Circuit Locally
```sh
$ bash ./scripts/setup.sh
```

## Run the Tests
```sh
$ hardhat test
```

## Setup and Run Slither
Install the [solc](https://github.com/ethereum/solidity#build-and-install) compiler. If you're on linux and use `apt` you can install it this way:
```sh
$ sudo add-apt-repository ppa:ethereum/ethereum
$ sudo apt-get update
$ sudo apt-get install solc
```


Setup python virtual environment:
```sh
$ python3 -m venv venv
$ source ./venv/bin/activate
(venv) $ pip3 install -r requirements.txt
```
Run slither:
```sh
(venv) $ slither --hardhat-cache-directory=./build/cache --hardhat-artifacts-directory=./build/artifacts .
```

If you don't activate the python venv you can use:
```sh
$ ./venv/bin/slither --hardhat-cache-directory=./build/cache --hardhat-artifacts-directory=./build/artifacts .
```

### envs
```bash
HARDHAT_NODE_LOGGING_ENABLED=1 # have the hardhat node print out rpc request info
```
