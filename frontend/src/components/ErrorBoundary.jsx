import React from 'react'
import ErrorFallback from './ErrorFallback'

function isChunkLoadError(error) {
  if (!error) return false
  const msg = error.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Unable to preload CSS') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    error.name === 'ChunkLoadError'
  )
}

const REFRESH_KEY = 'chunk_error_refresh'
const REFRESH_COOLDOWN_MS = 10000

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    if (isChunkLoadError(error)) {
      const lastRefresh = Number(sessionStorage.getItem(REFRESH_KEY) || 0)
      if (Date.now() - lastRefresh > REFRESH_COOLDOWN_MS) {
        sessionStorage.setItem(REFRESH_KEY, String(Date.now()))
        window.location.reload()
        return
      }
    }

    this.setState({ error, errorInfo })
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} />
    }

    return this.props.children
  }
}

export default ErrorBoundary
