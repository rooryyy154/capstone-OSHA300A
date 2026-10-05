import { Link } from 'react-router-dom'
import StatusMessage from '../components/states/StatusMessage.jsx'

export default function NotFound() {
  return (
    <div className="container not-found">
      <StatusMessage
        code={404}
        title="Page not found"
        message="The page you were looking for doesn't exist or has moved."
        action={
          <Link className="button button--small" to="/">
            Back to the findings
          </Link>
        }
      />
    </div>
  )
}
