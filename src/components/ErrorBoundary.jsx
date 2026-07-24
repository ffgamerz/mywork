import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
          <div className="p-4 text-center border">
            <div className="mb-3"><span className="material-symbols-outlined" style={{fontSize:'32px'}}>warning</span></div>
            <h5 className="fw-bold mb-2">Something went wrong</h5>
            <p className="mb-3 text-muted">An unexpected error occurred. Please try again or contact support.</p>
            {this.state.error && (
              <pre className="p-3 mb-3 text-start font-mono border overflow-auto">
                {this.state.error.message}
              </pre>
            )}
            <button onClick={this.handleRetry} className="btn btn-primary w-100 fw-bold py-3">
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}