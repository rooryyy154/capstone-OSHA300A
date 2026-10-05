import { Link } from 'react-router-dom'

export default function PageHeader({ title, lead, crumb }) {
  return (
    <div className="container">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li aria-current="page">{crumb ?? title}</li>
        </ol>
      </nav>
      <div className="page-header">
        <h1>{title}</h1>
        {lead && <p className="page-header__lead">{lead}</p>}
      </div>
    </div>
  )
}
