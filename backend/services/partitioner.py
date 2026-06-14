import random
import numpy as np
from scipy.spatial import Voronoi
from shapely.geometry import Polygon, LineString

def generate_boustrophedon_path(polygon_vertices: list, step_size: float = 0.3) -> list:
    """
    Generates a lawnmower (back-and-forth) coverage path for a polygon.
    Returns list of (x, y) waypoints that cover the entire polygon.
    step_size is the spacing between parallel passes in km.
    """
    poly = Polygon(polygon_vertices)
    if not poly.is_valid:
        poly = poly.buffer(0)
    
    min_x, min_y, max_x, max_y = poly.bounds
    waypoints = []
    
    # Generate vertical scan lines
    x_coords = np.arange(min_x + step_size / 2, max_x, step_size)
    if len(x_coords) == 0:
        x_coords = [ (min_x + max_x) / 2 ]
        
    reverse = False
    for x in x_coords:
        # Create a vertical line segment representing the scan pass
        scan_line = LineString([(x, min_y - 0.1), (x, max_y + 0.1)])
        intersection = poly.intersection(scan_line)
        
        if intersection.is_empty:
            continue
            
        points_on_x = []
        if intersection.geom_type == 'MultiLineString':
            for line in intersection.geoms:
                points_on_x.extend([line.coords[0][1], line.coords[1][1]])
        elif intersection.geom_type == 'LineString':
            points_on_x.extend([intersection.coords[0][1], intersection.coords[1][1]])
        elif intersection.geom_type == 'Point':
            points_on_x.append(intersection.y)
        
        if not points_on_x:
            continue
            
        points_on_x = sorted(points_on_x)
        
        # Take the extents of intersection on this scan line
        y_min, y_max = points_on_x[0], points_on_x[-1]
        
        # Add intermediate points if distance is large
        y_coords = np.arange(y_min, y_max, step_size).tolist()
        if not y_coords or y_coords[-1] < y_max:
            y_coords.append(y_max)
            
        if reverse:
            y_coords.reverse()
            
        for y in y_coords:
            waypoints.append((float(x), float(y)))
            
        reverse = not reverse
        
    if not waypoints:
        waypoints = [poly.centroid.coords[0]]
        
    return waypoints

def generate_radial_path(polygon_vertices: list, step_size: float = 0.3) -> list:
    """
    Generates a radial (spiral) coverage path for a polygon.
    Returns list of (x, y) waypoints.
    """
    from shapely.geometry import Point
    import math
    poly = Polygon(polygon_vertices)
    if not poly.is_valid:
        poly = poly.buffer(0)
    
    cx, cy = poly.centroid.x, poly.centroid.y
    
    # Find max distance to vertices to limit spiral expansion
    max_r = 0.0
    for px, py in polygon_vertices:
        dist = math.hypot(px - cx, py - cy)
        if dist > max_r:
            max_r = dist
            
    waypoints = []
    # Archimedean spiral: r = b * theta
    # step_size = b * 2 * pi => b = step_size / (2 * pi)
    b = step_size / (2 * math.pi)
    
    theta = 0.1
    while True:
        r = b * theta
        if r > max_r + step_size:
            break
            
        x = cx + r * math.cos(theta)
        y = cy + r * math.sin(theta)
        
        pt = Point(x, y)
        if poly.contains(pt) or poly.boundary.distance(pt) < 0.05:
            waypoints.append((float(x), float(y)))
            
        # Increment theta dynamically to maintain constant linear step size
        theta += step_size / max(0.1, r)
        
    if not waypoints:
        waypoints = [(float(cx), float(cy))]
        
    return waypoints

def fallback_grid_partition(area_width: float, area_height: float, agent_count: int, pattern: str = "boustrophedon") -> list[dict]:
    """
    Divides a rectangular search area into a simple regular grid of zones.
    """
    # Calculate rows and columns
    aspect_ratio = area_width / area_height
    cols = int(np.ceil(np.sqrt(agent_count * aspect_ratio)))
    rows = int(np.ceil(agent_count / cols))
    
    # Ensure rows * cols is enough, otherwise adjust
    while rows * cols < agent_count:
        rows += 1
        
    cell_w = area_width / cols
    cell_h = area_height / rows
    
    zones = []
    zone_id = 1
    
    for r in range(rows):
        for c in range(cols):
            if zone_id > agent_count:
                break
                
            x1 = c * cell_w
            x2 = (c + 1) * cell_w
            y1 = r * cell_h
            y2 = (r + 1) * cell_h
            
            polygon = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
            centroid = ((x1 + x2) / 2, (y1 + y2) / 2)
            
            if pattern == "radial":
                waypoints = generate_radial_path(polygon)
            else:
                waypoints = generate_boustrophedon_path(polygon)
            
            zones.append({
                "zone_id": zone_id,
                "polygon": polygon,
                "centroid": centroid,
                "waypoints": waypoints
            })
            zone_id += 1
            
    return zones

def partition_area(area_width: float, area_height: float, agent_count: int, pattern: str = "boustrophedon") -> list[dict]:
    """
    Divides a rectangular search area into zones.
    If pattern is 'radial', partitions into angular slices originating from the HQ (0,0).
    Otherwise, uses Voronoi or fallback grid partitioning.
    """
    import math
    if pattern == "radial":
        zones = []
        N = agent_count
        # Set radius to cover the requested dimensions properly
        R = max(area_width, area_height)
        
        for i in range(N):
            theta_a = i * (2.0 * math.pi) / N
            theta_b = (i + 1) * (2.0 * math.pi) / N
            
            poly_vertices = [
                (0.0, 0.0),
                (R * math.cos(theta_a), R * math.sin(theta_a)),
                (R * math.cos(theta_b), R * math.sin(theta_b)),
                (0.0, 0.0)
            ]
            
            phi = (i + 0.5) * (2.0 * math.pi) / N
            centroid_x = (R * 2.0 / 3.0) * math.cos(phi)
            centroid_y = (R * 2.0 / 3.0) * math.sin(phi)
            
            waypoints = []
            step = 0.3
            t_val = step
            while t_val < R:
                waypoints.append((t_val * math.cos(phi), t_val * math.sin(phi)))
                t_val += step
            waypoints.append((R * math.cos(phi), R * math.sin(phi)))
            
            zones.append({
                "zone_id": i + 1,
                "polygon": poly_vertices,
                "centroid": (centroid_x, centroid_y),
                "waypoints": waypoints
            })
            
        return zones

    if agent_count < 4:
        return fallback_grid_partition(area_width, area_height, agent_count, pattern)
        
    try:
        # Generate random seed points within the area
        np.random.seed(42) # Consistent seeds for replication
        points = []
        for _ in range(agent_count):
            points.append([
                random.uniform(0.1 * area_width, 0.9 * area_width),
                random.uniform(0.1 * area_height, 0.9 * area_height)
            ])
        points = np.array(points)
        
        # Mirror points to handle boundaries and ensure bounded cells
        boundary = np.array([
            [-area_width, -area_height], [2*area_width, -area_height],
            [2*area_width, 2*area_height], [-area_width, 2*area_height]
        ])
        # Add side mirrors
        mirrors = []
        for pt in points:
            mirrors.append([-pt[0], pt[1]]) # Left
            mirrors.append([2*area_width - pt[0], pt[1]]) # Right
            mirrors.append([pt[0], -pt[1]]) # Bottom
            mirrors.append([pt[0], 2*area_height - pt[1]]) # Top
            
        all_points = np.vstack([points, boundary, mirrors])
        
        # Compute Voronoi
        vor = Voronoi(all_points)
        
        boundary_polygon = Polygon([(0, 0), (area_width, 0), (area_width, area_height), (0, area_height)])
        zones = []
        
        # First agent_count regions correspond to our original points
        for i in range(agent_count):
            region_idx = vor.point_region[i]
            region = vor.regions[region_idx]
            
            if -1 in region or not region:
                continue
                
            vertices = [vor.vertices[v_idx] for v_idx in region]
            poly = Polygon(vertices)
            
            # Clip to area boundary
            clipped_poly = poly.intersection(boundary_polygon)
            
            if clipped_poly.is_empty:
                continue
                
            if clipped_poly.geom_type != 'Polygon':
                # If we get a MultiPolygon or LineString, get its largest polygon component
                if clipped_poly.geom_type == 'MultiPolygon':
                    clipped_poly = max(clipped_poly.geoms, key=lambda p: p.area)
                else:
                    continue
            
            coords = list(clipped_poly.exterior.coords)
            centroid = (clipped_poly.centroid.x, clipped_poly.centroid.y)
            
            if pattern == "radial":
                waypoints = generate_radial_path(coords)
            else:
                waypoints = generate_boustrophedon_path(coords)
            
            zones.append({
                "zone_id": i + 1,
                "polygon": coords,
                "centroid": centroid,
                "waypoints": waypoints
            })
            
        # If Voronoi failed to yield enough valid regions, fallback to grid
        if len(zones) < agent_count:
            return fallback_grid_partition(area_width, area_height, agent_count, pattern)
            
        return zones
        
    except Exception as e:
        print(f"Voronoi partitioning failed: {e}. Falling back to grid.")
        return fallback_grid_partition(area_width, area_height, agent_count, pattern)
