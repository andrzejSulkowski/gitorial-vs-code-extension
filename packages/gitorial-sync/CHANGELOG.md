# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2025-06-10
New RelayClient API

## [0.2.0] - 2025-06-03

### Added
- **Dynamic Role Management System**: Complete implementation of role-based client coordination
  - `ClientRole` enum with `ACTIVE`, `PASSIVE`, and `REQUESTING` states
  - `requestActiveRole()` method for requesting control of tutorial progression
  - `offerControlToOther()` method for offering control to other clients
  - `releaseActiveRole()` method for gracefully releasing control
  - Role transfer negotiation with accept/decline mechanisms
  - Server-side role coordination and conflict resolution
  - Only active clients can send tutorial state updates
  - Passive clients automatically receive state updates

### Enhanced
- **RelayClient**: Complete refactor with role-aware message handling
  - Role-based event system (`roleChanged`, `controlRequested`, `controlOffered`)
  - Automatic role state management and synchronization
  - Enhanced error handling for role-related operations
  - Consistent client ID generation for reliable role tracking

- **RelaySessionManager**: Advanced session management with role coordination
  - Role transfer orchestration between clients
  - Active client tracking per session
  - Role conflict resolution strategies
  - Enhanced logging for role management operations

### Breaking Changes
- Removed client-side session token generation (now server-managed)
- `connectToRelay()` now requires explicit session ID parameter
- Removed `getQRCodeUrl()` and `getShareableUrl()` methods
- Message handling completely rewritten for role-based architecture

### Testing
- Comprehensive test suite with 22 passing tests
- Integration tests with real Express server and WebSocket connections
- Role management test scenarios covering all transfer patterns
- DotCodeSchool.com ↔ VS Code Extension workflow validation

## [0.1.0] - 2025-05-27

### Added
- Initial release with basic relay client functionality
- Universal Node.js and browser compatibility
- WebSocket-based real-time communication
- Tutorial state synchronization
- Basic session management