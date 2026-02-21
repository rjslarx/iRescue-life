# Contributing to iRescue.life

Thank you for your interest in contributing to iRescue.life! This open-source platform helps animal rescue organizations manage their operations more efficiently, and we welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Security](#security)

## Code of Conduct

By participating in this project, you agree to maintain a welcoming and inclusive environment. We expect all contributors to:

- Be respectful and considerate in all communications
- Accept constructive criticism gracefully
- Focus on what is best for the community and the animals we serve
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/irescue-life.git
   cd irescue-life
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Set up the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   Open http://localhost:5000 in your browser

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Screenshots if applicable
- Your environment (OS, browser, Node version)

### Suggesting Features

We love feature suggestions! Please:

- Check if the feature has already been suggested
- Provide a clear description of the feature
- Explain why this feature would benefit animal rescues
- Include mockups or examples if possible

### Contributing Code

1. **Find an issue to work on**
   - Look for issues labeled `good first issue` or `help wanted`
   - Comment on the issue to let others know you're working on it

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow our coding standards
   - Write tests for new functionality
   - Update documentation as needed

4. **Commit your changes**
   ```bash
   git commit -m "feat: add amazing feature"
   ```
   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Pull Request Process

1. **Ensure your PR:**
   - Has a clear title and description
   - References any related issues
   - Includes tests for new functionality
   - Passes all existing tests
   - Follows coding standards

2. **Code Review**
   - At least one maintainer will review your PR
   - Address any requested changes
   - Be patient - reviews may take a few days

3. **Merge**
   - Once approved, a maintainer will merge your PR
   - Your contribution will be included in the next release

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types - avoid `any` when possible
- Use interfaces for object shapes
- Export types from `@shared/schema.ts` for shared types

### React/Frontend

- Use functional components with hooks
- Follow the existing component structure in `client/src/components`
- Use shadcn/ui components from `@/components/ui`
- Follow the design guidelines in `design_guidelines.md`
- Add `data-testid` attributes for testing

### Backend/Express

- Keep route handlers thin - business logic goes in services
- Use Drizzle ORM for database operations
- Validate request bodies with Zod schemas
- Handle errors appropriately with proper status codes

### Database

- Use Drizzle migrations for schema changes
- Include `tenantId` for multi-tenant tables
- Follow existing naming conventions (snake_case for columns)

### File Structure

```
client/src/
  components/     # Reusable UI components
  pages/          # Page components
  hooks/          # Custom React hooks
  lib/            # Utilities and helpers

server/
  routes/         # Express route handlers
  services/       # Business logic
  lib/            # Server utilities
  config/         # Configuration

shared/
  schema.ts       # Database schema and types
```

## Testing

### Running Tests

```bash
# Type checking
npm run check

# Build verification
npm run build
```

### Writing Tests

- Test new features and bug fixes
- Focus on critical paths and edge cases
- Use descriptive test names

## Security

### Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please email security concerns to the maintainers directly. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

When contributing, please:

- Never commit secrets, API keys, or passwords
- Use environment variables for sensitive configuration
- Sanitize user input to prevent XSS and SQL injection
- Follow the principle of least privilege

## Questions?

If you have questions about contributing:

- Check existing issues and discussions
- Open a new discussion for general questions
- Reach out to maintainers

Thank you for helping make iRescue.life better for animal rescue organizations everywhere!
