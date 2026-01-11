# iRescue.life

An open-source animal rescue management platform.

## Description

iRescue.life is a comprehensive platform designed to help animal rescue organizations manage their operations efficiently. From intake and medical records to adoptions and volunteer coordination, this platform streamlines the entire rescue workflow.

## Self-Hosting (Free)

You can run iRescue.life on your own infrastructure for free.

### Option 1: Run on Replit

1. Fork this repository on GitHub
2. Go to [Replit](https://replit.com) and create an account
3. Click "Create Repl" and select "Import from GitHub"
4. Paste your forked repository URL
5. Replit will automatically detect the configuration and set up the environment
6. Click "Run" to start the application

### Option 2: Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/irescue-life.git
   cd irescue-life
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment variables (copy `.env.example` to `.env` and configure)

4. Set up the database:
   ```bash
   npm run db:push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open your browser to `http://localhost:5000`

## Managed Hosting (Paid)

Don't want to manage servers? Sign up for our fully managed cloud version here: [Link Pending]

## Contributing

We welcome contributions from the community! Whether it's bug fixes, new features, or documentation improvements, your pull requests are appreciated.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See the [LICENSE](LICENSE) file for details.

This means if you modify and host this application, you must also share your source code.
